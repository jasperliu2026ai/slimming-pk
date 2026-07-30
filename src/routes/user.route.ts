import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middlewares/validate';
import { authRequired } from '../middlewares/auth';
import {
  createTestAccountSchema,
  switchTestAccountSchema,
  testAccountParamsSchema,
  unlockTestAccountsSchema,
  updateProfileSchema,
} from '../validators/user.schema';
import * as userController from '../controllers/user.controller';

export const userRouter = Router();

/**
 * @openapi
 * /users/wechat-login:
 *   post:
 *     summary: 微信登录（code2session）
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200: { description: OK }
 */
/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: 获取当前用户档案
 *     tags: [User]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
userRouter.get('/me', authRequired, userController.getProfile);

const testAdminUnlockLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

userRouter.post(
  '/test-accounts/unlock',
  authRequired,
  testAdminUnlockLimiter,
  validate(unlockTestAccountsSchema),
  userController.unlockTestAccounts,
);
userRouter.post(
  '/test-accounts',
  authRequired,
  validate(createTestAccountSchema),
  userController.createTestAccount,
);
userRouter.post(
  '/test-accounts/switch',
  authRequired,
  validate(switchTestAccountSchema),
  userController.switchTestAccount,
);
userRouter.delete(
  '/test-accounts/:accountId',
  authRequired,
  validate(testAccountParamsSchema, 'params'),
  userController.deleteTestAccount,
);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     summary: 更新当前用户档案
 *     tags: [User]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
userRouter.patch('/me', authRequired, validate(updateProfileSchema), userController.updateProfile);
// 微信小程序请求层将 PATCH 兼容转换为 PUT。
userRouter.put('/me', authRequired, validate(updateProfileSchema), userController.updateProfile);
userRouter.delete('/me', authRequired, userController.deleteProfile);
