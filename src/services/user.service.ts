import jwt, { SignOptions } from 'jsonwebtoken';
import { Prisma, User } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { NotFoundError, UnauthorizedError } from '../utils/AppError';
import { UpdateProfileDto } from '../validators/user.schema';
import { assertOwnedObjectKey, deleteManagedObjects, getSignedAvatarUrl } from './storage.service';

function jsonStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

async function toPublicUser(user: User) {
  let avatarDisplayUrl = '';
  try {
    avatarDisplayUrl = await getSignedAvatarUrl(user.avatarUrl);
  } catch (error) {
    logger.warn({ error, userId: user.id }, 'failed to sign profile avatar');
  }
  return {
    ...user,
    avatarDisplayUrl,
    targetWeightKg: user.targetWeightKg === null ? null : Number(user.targetWeightKg),
    currentWeightKg: user.currentWeightKg === null ? null : Number(user.currentWeightKg),
    privacyAgreedAt: user.privacyAgreedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function resolveWechatIdentity(code: string) {
  if (!env.WECHAT_APPID || !env.WECHAT_APPSECRET) {
    return { openid: 'local-demo-openid', unionid: null };
  }

  const query = new URLSearchParams({
    appid: env.WECHAT_APPID,
    secret: env.WECHAT_APPSECRET,
    js_code: code,
    grant_type: 'authorization_code',
  });
  const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query}`);
  const result = (await response.json()) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!response.ok || !result.openid) {
    logger.warn({ errcode: result.errcode, errmsg: result.errmsg }, 'wechat code2session failed');
    throw new UnauthorizedError('微信登录失败，请重新尝试');
  }
  return { openid: result.openid, unionid: result.unionid ?? null };
}

export async function loginByWechatCode(code: string, privacyAgreed: true, traceId: string) {
  logger.info({ traceId }, 'wechat login called');
  const identity = await resolveWechatIdentity(code);
  const privacyAgreedAt = privacyAgreed ? new Date() : undefined;
  const isLocalDemo = identity.openid === 'local-demo-openid';
  const user = await prisma.user.upsert({
    where: { openid: identity.openid },
    update: {
      unionid: identity.unionid ?? undefined,
      privacyAgreedAt,
    },
    create: {
      ...(isLocalDemo ? { id: 'demo-user-id' } : {}),
      openid: identity.openid,
      unionid: identity.unionid,
      nickname: isLocalDemo ? '减肥达人' : '微信用户',
      avatarUrl: '',
      heightCm: isLocalDemo ? 165 : null,
      targetWeightKg: isLocalDemo ? new Prisma.Decimal(55) : null,
      currentWeightKg: isLocalDemo ? new Prisma.Decimal(63.2) : null,
      privacyAgreedAt,
    },
  });
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, options);
  return { token, user: await toPublicUser(user) };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return toPublicUser(user);
}

export async function updateProfile(userId: string, dto: UpdateProfileDto) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, avatarUrl: true },
  });
  if (!existing) throw new NotFoundError('User not found');
  if (dto.avatarUrl !== undefined) assertOwnedObjectKey(dto.avatarUrl, userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      nickname: dto.nickname,
      avatarUrl: dto.avatarUrl,
      gender: dto.gender,
      heightCm: dto.heightCm,
      targetWeightKg:
        dto.targetWeightKg === undefined ? undefined : new Prisma.Decimal(dto.targetWeightKg),
    },
  });
  if (dto.avatarUrl && existing.avatarUrl && existing.avatarUrl !== dto.avatarUrl) {
    deleteManagedObjects([existing.avatarUrl]).catch((error) => {
      logger.warn({ error, userId }, 'failed to delete replaced avatar');
    });
  }
  return toPublicUser(user);
}

export async function deleteProfile(userId: string) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, avatarUrl: true },
  });
  if (!existing) throw new NotFoundError('User not found');
  const [memberships, checkins] = await Promise.all([
    prisma.roomMember.findMany({
      where: { OR: [{ userId }, { room: { creatorId: userId } }] },
      select: { initialPhotoKey: true },
    }),
    prisma.checkin.findMany({
      where: { OR: [{ userId }, { room: { creatorId: userId } }] },
      select: {
        weightPhotoKey: true,
        dietPhotoUrls: true,
        exercisePhotoUrls: true,
      },
    }),
  ]);
  await deleteManagedObjects([
    existing.avatarUrl,
    ...memberships.map((item) => item.initialPhotoKey),
    ...checkins.flatMap((item) => [
      item.weightPhotoKey ?? '',
      ...jsonStrings(item.dietPhotoUrls),
      ...jsonStrings(item.exercisePhotoUrls),
    ]),
  ]);
  await prisma.$transaction(async (tx) => {
    await tx.pkRoom.deleteMany({ where: { creatorId: userId } });
    await tx.user.delete({ where: { id: userId } });
  });
  return { deleted: true };
}
