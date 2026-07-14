import { NextFunction, Request, Response, RequestHandler } from 'express';

/**
 * 包裹 async controller，自动把 Promise reject 交给 Express 错误中间件。
 * 即使已经引入了 express-async-errors，也建议对新写的 handler 显式包裹，保持一致性。
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
