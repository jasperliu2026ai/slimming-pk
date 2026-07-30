import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as roomService from '../services/room.service';
import { CreateRoomDto, DecideJoinRequestDto, JoinRoomDto } from '../validators/room.schema';

const ok = (res: Response, data: unknown) => res.json({ code: 0, message: 'ok', data });

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const list = await roomService.listRooms(req.userId!);
  ok(res, { list, total: list.length, page: 1, pageSize: 20, hasMore: false });
});

export const getRoom = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await roomService.getRoom(req.params.roomId, req.userId!));
});

export const getRoomByInviteCode = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await roomService.getRoomByInviteCode(req.params.inviteCode, req.userId!));
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({
    code: 0,
    message: 'ok',
    data: await roomService.createRoom(req.userId!, req.body as CreateRoomDto),
  });
});

export const createJoinRequest = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({
    code: 0,
    message: 'ok',
    data: await roomService.createJoinRequest(
      req.params.roomId,
      req.userId!,
      req.body as JoinRoomDto,
    ),
  });
});

export const listJoinRequests = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await roomService.listJoinRequests(req.params.roomId, req.userId!));
});

export const decideJoinRequest = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    await roomService.decideJoinRequest(
      req.params.roomId,
      req.params.requestId,
      req.userId!,
      (req.body as DecideJoinRequestDto).action,
    ),
  );
});

export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const result = await roomService.getLeaderboard(req.params.roomId);
  const myRank = result.list.find((item) => item.userId === req.userId!)?.rank ?? null;
  ok(res, { ...result, myRank });
});

export const getSettlement = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await roomService.getSettlement(req.params.roomId, req.userId!));
});
