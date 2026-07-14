import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * 打卡路由
 * TODO(斯斯): 补齐 create（体重+图片凭证）/ list / detail / delete
 * 防作弊：签名+时间戳+防重放；体重合理性校验（一天不允许 >= 5kg 波动）
 */
export const checkinRouter = Router();

/**
 * @openapi
 * /checkins/ping:
 *   get:
 *     tags: [Checkin]
 *     summary: 打卡模块占位路由（待实现）
 *     responses:
 *       200:
 *         description: ok
 */
checkinRouter.get(
  '/ping',
  asyncHandler(async (_req, res) => {
    res.json({ module: 'checkin', status: 'wip' });
  }),
);
