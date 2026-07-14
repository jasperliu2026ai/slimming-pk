import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/AppError';

interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT 鉴权中间件：从 Authorization: Bearer <token> 中提取并校验。
 * 校验成功后把 userId 挂到 req 上供后续 handler 使用。
 */
export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing bearer token'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = payload.userId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
