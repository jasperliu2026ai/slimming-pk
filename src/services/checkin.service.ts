import { Checkin, MemberStatus, Prisma, RoomStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { ConflictError, NotFoundError } from '../utils/AppError';
import { dateOnly, shanghaiDateString } from '../utils/date';
import { CheckinDto } from '../validators/checkin.schema';
import { assertOwnedObjectKey } from './storage.service';
import { checkWechatUserText } from './wechat-security.service';

function todayDate() {
  return dateOnly(shanghaiDateString());
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toPublicCheckin(checkin: Checkin) {
  return {
    ...checkin,
    date: checkin.checkinDate.toISOString().slice(0, 10),
    weightKg: checkin.weightKg === null ? undefined : Number(checkin.weightKg),
    weightPhotoUrl: checkin.weightPhotoKey ?? undefined,
    dietPhotoUrls: stringArray(checkin.dietPhotoUrls),
    exercisePhotoUrls: stringArray(checkin.exercisePhotoUrls),
    createdAt: checkin.createdAt.toISOString(),
    updatedAt: checkin.updatedAt.toISOString(),
    checkinDate: undefined,
    weightPhotoKey: undefined,
  };
}

export async function saveTodayCheckin(roomId: string, userId: string, dto: CheckinDto) {
  await checkWechatUserText(userId, [dto.dietText, dto.exerciseText], 2);
  return prisma.$transaction(async (tx) => {
    const member = await tx.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { room: true },
    });
    if (!member || member.status !== MemberStatus.active) {
      throw new NotFoundError('请先加入该 PK');
    }
    const today = shanghaiDateString();
    const startDate = member.room.startDate.toISOString().slice(0, 10);
    const endDate = member.room.endDate.toISOString().slice(0, 10);
    if (member.room.status === RoomStatus.dissolved || today < startDate || today > endDate) {
      throw new ConflictError(today < startDate ? '该 PK 尚未开始' : '该 PK 已结束，无法继续打卡');
    }
    if (
      dto.weightKg !== undefined &&
      Math.abs(dto.weightKg - Number(member.currentWeightKg)) >= 5
    ) {
      throw new ConflictError('单日体重变化不能达到 5kg，请检查后重试');
    }
    const photoReferences = [
      dto.weightPhotoUrl,
      ...(dto.dietPhotoUrls ?? []),
      ...(dto.exercisePhotoUrls ?? []),
    ].filter((value): value is string => Boolean(value));
    photoReferences.forEach((value) => assertOwnedObjectKey(value, userId));

    const checkinDate = todayDate();
    const checkin = await tx.checkin.upsert({
      where: { roomId_userId_checkinDate: { roomId, userId, checkinDate } },
      update: {
        weightKg: dto.weightKg,
        weightPhotoKey: dto.weightPhotoUrl,
        dietText: dto.dietText,
        dietPhotoUrls: dto.dietPhotoUrls,
        exerciseText: dto.exerciseText,
        exercisePhotoUrls: dto.exercisePhotoUrls,
      },
      create: {
        roomId,
        userId,
        checkinDate,
        weightKg: dto.weightKg,
        weightPhotoKey: dto.weightPhotoUrl,
        dietText: dto.dietText,
        dietPhotoUrls: dto.dietPhotoUrls ?? [],
        exerciseText: dto.exerciseText,
        exercisePhotoUrls: dto.exercisePhotoUrls ?? [],
      },
    });
    if (dto.weightKg !== undefined) {
      const weight = new Prisma.Decimal(dto.weightKg);
      await Promise.all([
        tx.roomMember.update({
          where: { roomId_userId: { roomId, userId } },
          data: { currentWeightKg: weight },
        }),
        tx.user.update({ where: { id: userId }, data: { currentWeightKg: weight } }),
      ]);
    }
    return toPublicCheckin(checkin);
  });
}

export async function listCheckins(roomId: string, userId: string) {
  const rows = await prisma.checkin.findMany({
    where: { roomId, userId },
    orderBy: { checkinDate: 'desc' },
  });
  return rows.map(toPublicCheckin);
}

export async function getTodayCheckin(roomId: string, userId: string) {
  const row = await prisma.checkin.findUnique({
    where: { roomId_userId_checkinDate: { roomId, userId, checkinDate: todayDate() } },
  });
  return row ? toPublicCheckin(row) : null;
}
