import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as roomService from '../services/room.service';
import { CreateRoomDto, JoinRoomDto } from '../validators/room.schema';

const ok = (res: Response, data: unknown) => res.json({ code: 0, message: 'ok', data });

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  ok(res, roomService.listRooms(req.userId!));
});

export const getRoom = asyncHandler(async (req: Request, res: Response) => {
  ok(res, roomService.getRoom(req.params.roomId, req.userId!));
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({
    code: 0,
    message: 'ok',
    data: roomService.createRoom(req.userId!, req.body as CreateRoomDto),
  });
});

export const joinRoom = asyncHandler(async (req: Request, res: Response) => {
  ok(res, roomService.joinRoom(req.params.roomId, req.userId!, req.body as JoinRoomDto));
});

export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  ok(res, roomService.getLeaderboard(req.params.roomId));
});

export const getSettlement = asyncHandler(async (req: Request, res: Response) => {
  ok(res, roomService.getSettlement(req.params.roomId, req.userId!));
});
