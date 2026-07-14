import { Router } from 'express';
import { authRequired } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as controller from '../controllers/checkin.controller';
import { checkinSchema } from '../validators/checkin.schema';
import { roomIdParamsSchema } from '../validators/room.schema';

export const checkinRouter = Router({ mergeParams: true });

checkinRouter.use(authRequired);
checkinRouter.get('/', validate(roomIdParamsSchema, 'params'), controller.list);
checkinRouter.post(
  '/',
  validate(roomIdParamsSchema, 'params'),
  validate(checkinSchema),
  controller.saveToday,
);
