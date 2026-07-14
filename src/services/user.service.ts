import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotFoundError } from '../utils/AppError';
import { UpdateProfileDto } from '../validators/user.schema';

/**
 * TODO(斯斯): 接入真实的 Prisma Client + 微信登录接口。
 * 这里先给出接口形状，让前端/QA 可以先联调 mock。
 */

interface UserProfile {
  userId: string;
  nickname: string;
  gender: 'male' | 'female' | 'unknown';
  heightCm?: number;
  targetWeightKg?: number;
}

export async function loginByWechatCode(code: string, traceId: string) {
  logger.info({ traceId, codeLen: code.length }, 'wechat login called');
  // TODO: 调 https://api.weixin.qq.com/sns/jscode2session 拿 openid / session_key
  // TODO: upsert 用户表并生成 JWT
  const userId = 'demo-user-id';
  const token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  return { userId, token };
}

export async function getProfile(userId: string): Promise<UserProfile> {
  // TODO: prisma.user.findUnique
  if (!userId) throw new NotFoundError('User not found');
  return { userId, nickname: 'demo', gender: 'unknown' };
}

export async function updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
  // TODO: prisma.user.update
  return {
    userId,
    nickname: dto.nickname ?? 'demo',
    gender: dto.gender ?? 'unknown',
    heightCm: dto.heightCm,
    targetWeightKg: dto.targetWeightKg,
  };
}
