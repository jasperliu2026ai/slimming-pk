import { z } from 'zod';
import { weightKgSchema } from './weight.schema';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const roomIdParamsSchema = z.object({
  roomId: z.string().min(1),
});

export const joinRequestParamsSchema = z.object({
  roomId: z.string().min(1),
  requestId: z.string().min(1),
});

export const inviteCodeParamsSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .regex(/^PK\d{4}$/i, '邀请码格式不正确'),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(20),
  durationDays: z.number().int().min(1).max(365),
  maxMembers: z.number().int().min(2).max(100).default(5),
  startDate: z.string().regex(datePattern, 'startDate must be YYYY-MM-DD'),
  initialWeightKg: weightKgSchema(30),
  initialPhotoUrl: z.string().max(500).optional().default(''),
});

export const joinRoomSchema = z.object({
  initialWeightKg: weightKgSchema(30),
  initialPhotoUrl: z.string().max(500).optional().default(''),
});

export const decideJoinRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const decideRestartInvitationSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export const restartInvitationParamsSchema = z.object({
  invitationId: z.string().min(1),
});

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type JoinRoomDto = z.infer<typeof joinRoomSchema>;
export type DecideJoinRequestDto = z.infer<typeof decideJoinRequestSchema>;
export type DecideRestartInvitationDto = z.infer<typeof decideRestartInvitationSchema>;
