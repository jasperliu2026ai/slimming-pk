import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { authRequired } from '../middlewares/auth';
import { updateProfileSchema } from '../validators/user.schema';
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
userRouter.delete('/me', authRequired, userController.deleteProfile);
