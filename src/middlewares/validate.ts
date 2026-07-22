import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/AppError';

type Source = 'body' | 'query' | 'params';

/**
 * 统一用 Zod 校验请求参数；校验通过后把结果写回 req[source]，供 controller 使用。
 * 用法：router.post('/x', validate(schema, 'body'), controller)
 */
export const validate =
  (schema: ZodSchema, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.flatten();
      const fieldMessage = Object.values(details.fieldErrors).flat().find(Boolean);
      const message = details.formErrors[0] ?? fieldMessage ?? '请求参数不正确';
      return next(new ValidationError(message, details));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[source] = result.data;
    next();
  };
