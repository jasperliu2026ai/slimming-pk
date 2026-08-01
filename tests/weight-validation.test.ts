import { checkinSchema } from '../src/validators/checkin.schema';
import { createRoomSchema } from '../src/validators/room.schema';
import { updateProfileSchema } from '../src/validators/user.schema';

describe('weight input validation', () => {
  const roomInput = {
    name: '体重校验 PK',
    durationDays: 7,
    maxMembers: 5,
    startDate: '2026-08-01',
    initialWeightKg: 60.12,
  };

  it('accepts a legal number with at most two decimal places', () => {
    expect(createRoomSchema.safeParse(roomInput).success).toBe(true);
    expect(checkinSchema.safeParse({ weightKg: 72.1 }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ targetWeightKg: 55.55 }).success).toBe(true);
  });

  it('rejects strings, non-finite values and more than two decimal places', () => {
    expect(createRoomSchema.safeParse({ ...roomInput, initialWeightKg: '60.12' }).success).toBe(
      false,
    );
    expect(checkinSchema.safeParse({ weightKg: Number.NaN }).success).toBe(false);
    expect(checkinSchema.safeParse({ weightKg: 72.123 }).success).toBe(false);
  });

  it('rejects values outside the supported range', () => {
    expect(checkinSchema.safeParse({ weightKg: 29.99 }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ targetWeightKg: 300.01 }).success).toBe(false);
  });
});
