import { Router } from 'express';
import { authRequired } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as controller from '../controllers/room.controller';
import { createRoomSchema, joinRoomSchema, roomIdParamsSchema } from '../validators/room.schema';

export const pkRouter = Router();

pkRouter.use(authRequired);
pkRouter.get('/', controller.listRooms);
pkRouter.post('/', validate(createRoomSchema), controller.createRoom);
pkRouter.get('/:roomId', validate(roomIdParamsSchema, 'params'), controller.getRoom);
pkRouter.post(
  '/:roomId/join',
  validate(roomIdParamsSchema, 'params'),
  validate(joinRoomSchema),
  controller.joinRoom,
);
pkRouter.get(
  '/:roomId/leaderboard',
  validate(roomIdParamsSchema, 'params'),
  controller.getLeaderboard,
);
pkRouter.get(
  '/:roomId/settlement',
  validate(roomIdParamsSchema, 'params'),
  controller.getSettlement,
);
