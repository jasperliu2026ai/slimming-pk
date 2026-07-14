import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

/**
 * 统一错误处理中间件：必须挂在所有路由之后。
 * 对外只暴露 code + message，不吐堆栈；日志里保留全量堆栈。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const traceId = req.traceId;

  if (err instanceof AppError) {
    logger.warn({ traceId, code: err.code, status: err.status, details: err.details }, err.message);
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
      traceId,
    });
  }

  logger.error({ traceId, err }, 'Unhandled error');
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    traceId,
  });
}

/** 404 兜底 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    traceId: req.traceId,
  });
}
