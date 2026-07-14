import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * 支付/资金路由
 * TODO(斯斯): 补齐 deposit（押金托管）/ refund / settle（结算奖金）/ ledger（流水查询）
 * 红线：金额单位分（整数）；FundLedger 只增不改；回调必须验签；退款走幂等+分布式锁
 */
export const paymentRouter = Router();

/**
 * @openapi
 * /payments/ping:
 *   get:
 *     tags: [Payment]
 *     summary: 支付模块占位路由（待实现）
 *     responses:
 *       200:
 *         description: ok
 */
paymentRouter.get(
  '/ping',
  asyncHandler(async (_req, res) => {
    res.json({ module: 'payment', status: 'wip' });
  }),
);
