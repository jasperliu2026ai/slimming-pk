import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as userService from '../services/user.service';
import {
  CreateTestAccountDto,
  SwitchTestAccountDto,
  UnlockTestAccountsDto,
  UpdateProfileDto,
  WechatLoginDto,
} from '../validators/user.schema';

export const wechatLogin = asyncHandler(async (req: Request, res: Response) => {
  const dto = req.body as WechatLoginDto;
  const result = await userService.loginByWechatCode(dto.code, dto.privacyAgreed, req.traceId);
  res.json({ code: 0, message: 'ok', data: result });
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const profile = await userService.getProfile(userId);
  res.json({ code: 0, message: 'ok', data: profile });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const dto = req.body as UpdateProfileDto;
  const profile = await userService.updateProfile(userId, dto);
  res.json({ code: 0, message: 'ok', data: profile });
});

export const deleteProfile = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.deleteProfile(req.userId!);
  res.json({ code: 0, message: 'ok', data: result });
});

export const unlockTestAccounts = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.unlockTestAccounts(
    req.userId!,
    (req.body as UnlockTestAccountsDto).password,
  );
  res.json({ code: 0, message: 'ok', data: result });
});

export const createTestAccount = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.createTestAccount(
    req.userId!,
    req.header('x-test-admin-token') ?? '',
    req.body as CreateTestAccountDto,
  );
  res.status(201).json({ code: 0, message: 'ok', data: result });
});

export const switchTestAccount = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.switchTestAccount(
    req.userId!,
    req.header('x-test-admin-token') ?? '',
    (req.body as SwitchTestAccountDto).accountId,
  );
  res.json({ code: 0, message: 'ok', data: result });
});

export const deleteTestAccount = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.deleteTestAccount(
    req.userId!,
    req.header('x-test-admin-token') ?? '',
    req.params.accountId,
  );
  res.json({ code: 0, message: 'ok', data: result });
});
