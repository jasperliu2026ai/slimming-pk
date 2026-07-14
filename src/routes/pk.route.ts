import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * PK 房间路由
 * TODO(斯斯): 状态机确认后补齐 create / join / leave / start / settle / detail / list
 * 设计文档见 docs/pk-state-machine.md
 */
export const pkRouter = Router();

/**
 * @openapi
 * /pk/rooms/ping:
 *   get:
 *     tags: [PK]
 *     summary: PK 模块占位路由（待实现）
 *     responses:
 *       200:
 *         description: ok
 */
pkRouter.get(
  '/rooms/ping',
  asyncHandler(async (_req, res) => {
    res.json({ module: 'pk', status: 'wip' });
  }),
);
