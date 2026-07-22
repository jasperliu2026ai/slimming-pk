import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as checkinService from '../services/checkin.service';
import { CheckinDto } from '../validators/checkin.schema';

export const saveToday = asyncHandler(async (req: Request, res: Response) => {
  const data = await checkinService.saveTodayCheckin(
    req.params.roomId,
    req.userId!,
    req.body as CheckinDto,
  );
  res.json({ code: 0, message: 'ok', data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const data = await checkinService.listCheckins(req.params.roomId, req.userId!);
  res.json({ code: 0, message: 'ok', data });
});

export const today = asyncHandler(async (req: Request, res: Response) => {
  const data = await checkinService.getTodayCheckin(req.params.roomId, req.userId!);
  res.json({ code: 0, message: 'ok', data });
});
