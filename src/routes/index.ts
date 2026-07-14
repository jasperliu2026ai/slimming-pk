import { Router } from 'express';
import { healthRouter } from './health.route';
import { userRouter } from './user.route';
import { pkRouter } from './pk.route';
import { checkinRouter } from './checkin.route';
import { authRouter } from './auth.route';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/rooms', pkRouter);
apiRouter.use('/rooms/:roomId/checkins', checkinRouter);
