import { Router } from 'express';
import { healthRouter } from './health.route';
import { userRouter } from './user.route';
import { pkRouter } from './pk.route';
import { checkinRouter } from './checkin.route';
import { paymentRouter } from './payment.route';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/pk', pkRouter);
apiRouter.use('/checkins', checkinRouter);
apiRouter.use('/payments', paymentRouter);
