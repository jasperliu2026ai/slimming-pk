import { Router } from 'express';

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
healthRouter.get('/', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'ok', ts: Date.now() } });
});
