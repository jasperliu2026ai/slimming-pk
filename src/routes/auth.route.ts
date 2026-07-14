import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { wechatLoginSchema } from '../validators/user.schema';
import { wechatLogin } from '../controllers/user.controller';

export const authRouter = Router();

authRouter.post('/wx-login', validate(wechatLoginSchema), wechatLogin);
