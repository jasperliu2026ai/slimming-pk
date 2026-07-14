import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as userService from '../services/user.service';
import { WechatLoginDto, UpdateProfileDto } from '../validators/user.schema';

export const wechatLogin = asyncHandler(async (req: Request, res: Response) => {
  const dto = req.body as WechatLoginDto;
  const result = await userService.loginByWechatCode(dto.code, req.traceId);
  res.json(result);
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const profile = await userService.getProfile(userId);
  res.json(profile);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const dto = req.body as UpdateProfileDto;
  const profile = await userService.updateProfile(userId, dto);
  res.json(profile);
});
