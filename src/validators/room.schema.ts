import { z } from 'zod';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const roomIdParamsSchema = z.object({
  roomId: z.string().min(1),
});

export const inviteCodeParamsSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .regex(/^PK\d{4}$/i, '邀请码格式不正确'),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(20),
  durationDays: z.number().int().min(7).max(90),
  maxMembers: z.number().int().min(2).max(8).default(5),
  startDate: z.string().regex(datePattern, 'startDate must be YYYY-MM-DD'),
  initialWeightKg: z.number().min(30).max(300),
  initialPhotoUrl: z.string().min(1),
});

export const joinRoomSchema = z.object({
  initialWeightKg: z.number().min(30).max(300),
  initialPhotoUrl: z.string().min(1),
});

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type JoinRoomDto = z.infer<typeof joinRoomSchema>;
