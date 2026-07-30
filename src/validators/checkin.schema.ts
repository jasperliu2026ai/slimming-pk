import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1, '打卡内容不能为空').max(200, '打卡内容不能超过 200 个字').optional(),
);

export const checkinSchema = z
  .object({
    weightKg: z.number().min(30).max(300).optional(),
    weightPhotoUrl: z.string().min(1).optional(),
    dietText: optionalText,
    dietPhotoUrls: z.array(z.string().min(1)).max(9).optional(),
    exerciseText: optionalText,
    exercisePhotoUrls: z.array(z.string().min(1)).max(9).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.weightKg !== undefined && !value.weightPhotoUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weightPhotoUrl'],
        message: '体重打卡必须上传现场照片',
      });
    }
    const hasAny =
      value.weightKg !== undefined ||
      Boolean(value.dietText) ||
      Boolean(value.dietPhotoUrls?.length) ||
      Boolean(value.exerciseText) ||
      Boolean(value.exercisePhotoUrls?.length);
    if (!hasAny) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '至少填写一种打卡内容' });
    }
  });

export type CheckinDto = z.infer<typeof checkinSchema>;
