import { Router } from 'express';
import { prisma } from '../config/database';

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: 健康检查
 *     tags: [Infra]
 *     responses:
 *       200:
 *         description: OK
 */
healthRouter.get('/', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    code: 0,
    message: 'ok',
    data: { status: 'ok', database: 'ok', ts: Date.now() },
  });
});
