import { z } from 'zod';

export const wechatLoginSchema = z.object({
  code: z.string().min(1, 'code is required'),
});
export type WechatLoginDto = z.infer<typeof wechatLoginSchema>;

export const updateProfileSchema = z.object({
  nickname: z.string().min(1).max(32).optional(),
  gender: z.enum(['male', 'female', 'unknown']).optional(),
  heightCm: z.number().int().min(50).max(260).optional(),
  targetWeightKg: z.number().min(20).max(300).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
