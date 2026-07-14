import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotFoundError } from '../utils/AppError';
import { users } from '../store/memoryStore';
import { UpdateProfileDto } from '../validators/user.schema';

export async function loginByWechatCode(code: string, privacyAgreed: true, traceId: string) {
  logger.info({ traceId, codeLen: code.length }, 'wechat login called');
  const user = users.get('demo-user-id');
  if (!user) throw new NotFoundError('User not found');
  if (privacyAgreed && !user.privacyAgreedAt) user.privacyAgreedAt = new Date().toISOString();
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, options);
  return { token, user };
}

export async function getProfile(userId: string) {
  const user = users.get(userId);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function updateProfile(userId: string, dto: UpdateProfileDto) {
  const user = users.get(userId);
  if (!user) throw new NotFoundError('User not found');
  const updated = {
    ...user,
    nickname: dto.nickname ?? user.nickname,
    gender: dto.gender ?? user.gender,
    heightCm: dto.heightCm ?? user.heightCm,
    targetWeightKg: dto.targetWeightKg ?? user.targetWeightKg,
  };
  users.set(userId, updated);
  return updated;
}

export async function deleteProfile(userId: string) {
  if (!users.has(userId)) throw new NotFoundError('User not found');
  users.delete(userId);
  return { deleted: true };
}
