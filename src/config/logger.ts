import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'fitpk-server' },
  redact: {
    // 敏感字段脱敏，避免落日志
    paths: [
      'req.headers.authorization',
      'req.headers.x-test-admin-token',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.openid',
      '*.unionid',
      '*.phone',
      '*.idCard',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});
