import { z } from 'zod';
import { weightKgSchema } from './weight.schema';

const publicNicknameSchema = z
  .string()
  .trim()
  .min(2, '昵称需要 2 至 12 个字符')
  .max(12, '昵称需要 2 至 12 个字符')
  .regex(/^[\p{L}\p{N}·]+$/u, '昵称只能包含中文、字母、数字或间隔点')
  .refine((value) => !/\d{5,}/.test(value), '昵称不能包含联系方式')
  .refine((value) => !/(微信|微.?信|vx|v信|qq|加我|进群|客服|官方|管理员)/iu.test(value), {
    message: '昵称不能包含联系方式或误导性身份',
  });

export const wechatLoginSchema = z.object({
  code: z.string().min(1, 'code is required'),
  privacyAgreed: z.literal(true, {
    errorMap: () => ({ message: 'privacy agreement is required' }),
  }),
});
export type WechatLoginDto = z.infer<typeof wechatLoginSchema>;

export const updateProfileSchema = z.object({
  nickname: publicNicknameSchema.optional(),
  avatarUrl: z.string().min(1).max(500).optional(),
  gender: z.enum(['male', 'female', 'unknown']).optional(),
  heightCm: z.number().int().min(50).max(260).optional(),
  targetWeightKg: weightKgSchema(20).optional(),
  preferredWeightUnit: z.enum(['kg', 'jin']).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const unlockTestAccountsSchema = z.object({
  password: z.string().min(1).max(100),
});

export const createTestAccountSchema = z.object({
  nickname: publicNicknameSchema,
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
