import { Router } from 'express';
import { authRequired } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as controller from '../controllers/room.controller';
import {
  createRoomSchema,
  decideJoinRequestSchema,
  decideRestartInvitationSchema,
  inviteCodeParamsSchema,
  joinRequestParamsSchema,
  joinRoomSchema,
  restartInvitationParamsSchema,
  roomIdParamsSchema,
} from '../validators/room.schema';

export const pkRouter = Router();

pkRouter.use(authRequired);
pkRouter.get('/', controller.listRooms);
pkRouter.post('/', validate(createRoomSchema), controller.createRoom);
pkRouter.get('/restart-invitations', controller.listRestartInvitations);
pkRouter.patch(
  '/restart-invitations/:invitationId',
  validate(restartInvitationParamsSchema, 'params'),
  validate(decideRestartInvitationSchema),
  controller.decideRestartInvitation,
);
pkRouter.get(
  '/invite/:inviteCode',
  validate(inviteCodeParamsSchema, 'params'),
  controller.getRoomByInviteCode,
);
pkRouter.get('/:roomId', validate(roomIdParamsSchema, 'params'), controller.getRoom);
pkRouter.get(
  '/:roomId/share-code',
  validate(roomIdParamsSchema, 'params'),
  controller.getShareCode,
);
pkRouter.post('/:roomId/end', validate(roomIdParamsSchema, 'params'), controller.endRoom);
pkRouter.post('/:roomId/archive', validate(roomIdParamsSchema, 'params'), controller.archiveRoom);
pkRouter.post('/:roomId/restore', validate(roomIdParamsSchema, 'params'), controller.restoreRoom);
pkRouter.post(
  '/:roomId/restart',
  validate(roomIdParamsSchema, 'params'),
  validate(createRoomSchema),
  controller.restartRoom,
);
pkRouter.post(
  '/:roomId/join',
  validate(roomIdParamsSchema, 'params'),
  validate(joinRoomSchema),
  controller.createJoinRequest,
);
pkRouter.post(
  '/:roomId/join-requests',
  validate(roomIdParamsSchema, 'params'),
  validate(joinRoomSchema),
  controller.createJoinRequest,
);
pkRouter.get(
  '/:roomId/join-requests',
  validate(roomIdParamsSchema, 'params'),
  controller.listJoinRequests,
);
pkRouter.patch(
  '/:roomId/join-requests/:requestId',
  validate(joinRequestParamsSchema, 'params'),
  validate(decideJoinRequestSchema),
  controller.decideJoinRequest,
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
