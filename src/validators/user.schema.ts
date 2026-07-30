import { z } from 'zod';

export const wechatLoginSchema = z.object({
  code: z.string().min(1, 'code is required'),
  privacyAgreed: z.literal(true, {
    errorMap: () => ({ message: 'privacy agreement is required' }),
  }),
});
export type WechatLoginDto = z.infer<typeof wechatLoginSchema>;

export const updateProfileSchema = z.object({
  nickname: z.string().min(1).max(32).optional(),
  avatarUrl: z.string().min(1).max(500).optional(),
  gender: z.enum(['male', 'female', 'unknown']).optional(),
  heightCm: z.number().int().min(50).max(260).optional(),
  targetWeightKg: z.number().min(20).max(300).optional(),
  preferredWeightUnit: z.enum(['kg', 'jin']).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const unlockTestAccountsSchema = z.object({
  password: z.string().min(1).max(100),
});

export const createTestAccountSchema = z.object({
  nickname: z.string().trim().min(1, '请输入测试账号昵称').max(32),
});

export const switchTestAccountSchema = z.object({
  accountId: z.string().min(1),
});

export const testAccountParamsSchema = z.object({
  accountId: z.string().min(1),
});

export type UnlockTestAccountsDto = z.infer<typeof unlockTestAccountsSchema>;
export type CreateTestAccountDto = z.infer<typeof createTestAccountSchema>;
export type SwitchTestAccountDto = z.infer<typeof switchTestAccountSchema>;
