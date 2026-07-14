import { z } from 'zod';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const roomIdParamsSchema = z.object({
  roomId: z.string().min(1),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(20),
  durationDays: z.number().int().min(7).max(90),
  startDate: z.string().regex(datePattern, 'startDate must be YYYY-MM-DD'),
});

export const joinRoomSchema = z.object({
  initialWeightKg: z.number().min(30).max(300),
  initialPhotoUrl: z.string().min(1),
});

export type CreateRoomDto = z.infer<typeof createRoomSchema>;
export type JoinRoomDto = z.infer<typeof joinRoomSchema>;
