import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * 为每个请求生成/透传 traceId，并写入响应头，便于全链路排障。
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-trace-id');
  req.traceId = incoming && incoming.length <= 64 ? incoming : uuidv4();
  res.setHeader('x-trace-id', req.traceId);
  next();
}
