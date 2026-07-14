import { randomUUID } from 'crypto';
import { checkins, members, users } from '../store/memoryStore';
import { ConflictError, NotFoundError } from '../utils/AppError';
import { CheckinDto } from '../validators/checkin.schema';

export function saveTodayCheckin(roomId: string, userId: string, dto: CheckinDto) {
  const member = members.find(
    (item) => item.roomId === roomId && item.userId === userId && item.status === 'active',
  );
  if (!member) throw new NotFoundError('请先加入该 PK');

  if (dto.weightKg !== undefined && Math.abs(dto.weightKg - member.currentWeightKg) >= 5) {
    throw new ConflictError('单日体重变化不能达到 5kg，请检查后重试');
  }

  const date = new Date().toISOString().slice(0, 10);
  const existing = checkins.find(
    (item) => item.roomId === roomId && item.userId === userId && item.date === date,
  );
  const timestamp = new Date().toISOString();
  if (existing) {
    Object.assign(existing, dto, { updatedAt: timestamp });
    if (dto.weightKg !== undefined) member.currentWeightKg = dto.weightKg;
    return existing;
  }

  const checkin = {
    id: `checkin-${randomUUID()}`,
    roomId,
    userId,
    date,
    ...dto,
    dietPhotoUrls: dto.dietPhotoUrls ?? [],
    exercisePhotoUrls: dto.exercisePhotoUrls ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  checkins.push(checkin);
  member.checkinDays += 1;
  if (dto.weightKg !== undefined) {
    member.currentWeightKg = dto.weightKg;
    const user = users.get(userId);
    if (user) user.currentWeightKg = dto.weightKg;
  }
  return checkin;
}

export function listCheckins(roomId: string, userId: string) {
  return checkins
    .filter((item) => item.roomId === roomId && item.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getTodayCheckin(roomId: string, userId: string) {
  const date = new Date().toISOString().slice(0, 10);
  return (
    checkins.find(
      (item) => item.roomId === roomId && item.userId === userId && item.date === date,
    ) ?? null
  );
}
