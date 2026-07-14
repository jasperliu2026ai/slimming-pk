import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './config/swagger';
import { requestContext } from './middlewares/requestContext';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  // 安全 & 通用中间件
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 请求上下文（traceId） + 日志
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ traceId: (req as express.Request).traceId }),
    }),
  );

  // 全局限流（可按路由细化）
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // 文档
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // 业务路由
  app.use('/api/v1', apiRouter);

  // 兜底
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
