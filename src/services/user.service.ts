import { randomUUID, timingSafeEqual } from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Prisma, User } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/AppError';
import { CreateTestAccountDto, UpdateProfileDto } from '../validators/user.schema';
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
    isTestAccount: Boolean(user.testOwnerId),
    avatarDisplayUrl,
    targetWeightKg: user.targetWeightKg === null ? null : Number(user.targetWeightKg),
    currentWeightKg: user.currentWeightKg === null ? null : Number(user.currentWeightKg),
    privacyAgreedAt: user.privacyAgreedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function signUserToken(userId: string) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign({ userId }, env.JWT_SECRET, options);
}

async function createAuthSession(user: User) {
  return { token: signUserToken(user.id), user: await toPublicUser(user) };
}

async function rootUserIdFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, testOwnerId: true },
  });
  if (!user) throw new NotFoundError('用户不存在');
  return user.testOwnerId ?? user.id;
}

function passwordMatches(input: string) {
  const actual = Buffer.from(env.TEST_ADMIN_PASSWORD);
  const received = Buffer.from(input);
  return actual.length === received.length && timingSafeEqual(actual, received);
}

async function listTestAccountSummaries(rootUserId: string, currentUserId: string) {
  const accounts = await prisma.user.findMany({
    where: { OR: [{ id: rootUserId }, { testOwnerId: rootUserId }] },
    orderBy: [{ testOwnerId: 'asc' }, { createdAt: 'asc' }],
  });
  return Promise.all(
    accounts.map(async (account) => {
      const user = await toPublicUser(account);
      return {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarDisplayUrl,
        isPrimary: account.id === rootUserId,
        isCurrent: account.id === currentUserId,
        createdAt: user.createdAt,
      };
    }),
  );
}

async function verifyTestAdminToken(rawToken: string, currentUserId: string) {
  if (!rawToken) throw new ForbiddenError('管理员操作已失效，请重新输入密码');
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(rawToken, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw new ForbiddenError('管理员操作已失效，请重新输入密码');
  }
  if (payload.scope !== 'test-admin' || typeof payload.rootUserId !== 'string') {
    throw new ForbiddenError('管理员操作无效');
  }
  const currentRootUserId = await rootUserIdFor(currentUserId);
  if (payload.rootUserId !== currentRootUserId) {
    throw new ForbiddenError('管理员操作无效');
  }
  return currentRootUserId;
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
  return createAuthSession(user);
}

export async function unlockTestAccounts(userId: string, password: string) {
  if (!passwordMatches(password)) throw new ForbiddenError('管理员密码错误');
  const rootUserId = await rootUserIdFor(userId);
  const adminToken = jwt.sign({ scope: 'test-admin', rootUserId }, env.JWT_SECRET, {
    expiresIn: '15m',
  });
  return {
    adminToken,
    accounts: await listTestAccountSummaries(rootUserId, userId),
  };
}

export async function createTestAccount(
  currentUserId: string,
  adminToken: string,
  dto: CreateTestAccountDto,
) {
  const rootUserId = await verifyTestAdminToken(adminToken, currentUserId);
  const accountCount = await prisma.user.count({ where: { testOwnerId: rootUserId } });
  if (accountCount >= 20) throw new ConflictError('测试账号最多创建 20 个');
  const account = await prisma.user.create({
    data: {
      openid: `test:${rootUserId}:${randomUUID()}`,
      nickname: dto.nickname,
      avatarUrl: '',
      privacyAgreedAt: new Date(),
      testOwnerId: rootUserId,
    },
  });
  return createAuthSession(account);
}

export async function switchTestAccount(
  currentUserId: string,
  adminToken: string,
  accountId: string,
) {
  const rootUserId = await verifyTestAdminToken(adminToken, currentUserId);
  const account = await prisma.user.findFirst({
    where: {
      id: accountId,
      OR: [{ id: rootUserId }, { testOwnerId: rootUserId }],
    },
  });
  if (!account) throw new NotFoundError('测试账号不存在');
  return createAuthSession(account);
}

export async function deleteTestAccount(
  currentUserId: string,
  adminToken: string,
  accountId: string,
) {
  const rootUserId = await verifyTestAdminToken(adminToken, currentUserId);
  if (accountId === rootUserId) throw new ForbiddenError('主账号不能删除');
  const account = await prisma.user.findFirst({
    where: { id: accountId, testOwnerId: rootUserId },
  });
  if (!account) throw new NotFoundError('测试账号不存在');
  await deleteProfile(accountId);
  const fallbackAuth =
    currentUserId === accountId
      ? await prisma.user
          .findUniqueOrThrow({ where: { id: rootUserId } })
          .then((root) => createAuthSession(root))
      : null;
  return { deleted: true, fallbackAuth };
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
    select: {
      id: true,
      avatarUrl: true,
      testAccounts: { select: { id: true, avatarUrl: true } },
    },
  });
  if (!existing) throw new NotFoundError('User not found');
  const accountIds = [existing.id, ...existing.testAccounts.map((account) => account.id)];
  const [memberships, checkins] = await Promise.all([
    prisma.roomMember.findMany({
      where: {
        OR: [{ userId: { in: accountIds } }, { room: { creatorId: { in: accountIds } } }],
      },
      select: { initialPhotoKey: true },
    }),
    prisma.checkin.findMany({
      where: {
        OR: [{ userId: { in: accountIds } }, { room: { creatorId: { in: accountIds } } }],
      },
      select: {
        weightPhotoKey: true,
        dietPhotoUrls: true,
        exercisePhotoUrls: true,
      },
    }),
  ]);
  await deleteManagedObjects([
    existing.avatarUrl,
    ...existing.testAccounts.map((account) => account.avatarUrl),
    ...memberships.map((item) => item.initialPhotoKey),
    ...checkins.flatMap((item) => [
      item.weightPhotoKey ?? '',
      ...jsonStrings(item.dietPhotoUrls),
      ...jsonStrings(item.exercisePhotoUrls),
    ]),
  ]);
  await prisma.$transaction(async (tx) => {
    await tx.pkRoom.deleteMany({ where: { creatorId: { in: accountIds } } });
    await tx.user.delete({ where: { id: userId } });
  });
  return { deleted: true };
}
