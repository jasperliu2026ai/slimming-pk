import { MemberStatus, Prisma, PrismaClient, RoomStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { ConflictError, NotFoundError } from '../utils/AppError';
import { CreateRoomDto, JoinRoomDto } from '../validators/room.schema';
import { assertOwnedObjectKey } from './storage.service';

type DbClient = Prisma.TransactionClient | PrismaClient;

const roomInclude = {
  creator: true,
  members: {
    where: { status: MemberStatus.active },
    include: { user: true },
  },
} satisfies Prisma.PkRoomInclude;

type RoomWithMembers = Prisma.PkRoomGetPayload<{ include: typeof roomInclude }>;

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = dateOnly(date);
  value.setUTCDate(value.getUTCDate() + days - 1);
  return value;
}

async function loadRanking(client: DbClient, room: RoomWithMembers) {
  const counts = await client.checkin.groupBy({
    by: ['userId'],
    where: { roomId: room.id },
    _count: { _all: true },
  });
  const countByUser = new Map(counts.map((item) => [item.userId, item._count._all]));
  return room.members
    .map((member) => {
      const initialWeightKg = Number(member.initialWeightKg);
      const currentWeightKg = Number(member.currentWeightKg);
      const checkinDays = countByUser.get(member.userId) ?? 0;
      const weightLossPercent = Math.max(
        0,
        Number((((initialWeightKg - currentWeightKg) / initialWeightKg) * 100).toFixed(2)),
      );
      const checkinRate = Math.min(1, checkinDays / room.durationDays);
      const score = Math.min(100, Math.round(weightLossPercent * 14 + checkinRate * 30));
      return {
        userId: member.userId,
        nickname: member.user.nickname,
        avatarUrl: member.user.avatarUrl,
        score,
        weightLossPercent,
        checkinDays,
        totalDays: room.durationDays,
        status: member.status,
      };
    })
    .sort((a, b) => b.score - a.score || b.weightLossPercent - a.weightLossPercent)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

async function toPublicRoom(client: DbClient, room: RoomWithMembers, userId: string) {
  const ranking = await loadRanking(client, room);
  const myProgress = ranking.find((item) => item.userId === userId);
  return {
    id: room.id,
    inviteCode: room.inviteCode,
    name: room.name,
    status: room.status,
    startDate: dateString(room.startDate),
    endDate: dateString(room.endDate),
    durationDays: room.durationDays,
    maxMembers: room.maxMembers,
    creatorId: room.creatorId,
    creatorNickname: room.creator.nickname,
    createdAt: room.createdAt.toISOString(),
    memberCount: room.members.length,
    isMember: Boolean(myProgress),
    myProgress,
  };
}

async function findRoomOrThrow(client: DbClient, roomId: string) {
  const room = await client.pkRoom.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!room) throw new NotFoundError('PK 房间不存在');
  return room;
}

export async function listRooms(userId: string) {
  const rooms = await prisma.pkRoom.findMany({
    include: roomInclude,
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(rooms.map((room) => toPublicRoom(prisma, room, userId)));
}

export async function getRoom(roomId: string, userId: string) {
  return toPublicRoom(prisma, await findRoomOrThrow(prisma, roomId), userId);
}

export async function getRoomByInviteCode(inviteCode: string, userId: string) {
  const room = await prisma.pkRoom.findUnique({
    where: { inviteCode: inviteCode.toUpperCase() },
    include: roomInclude,
  });
  if (!room) throw new NotFoundError('邀请码无效或 PK 已结束');
  if (room.status === RoomStatus.ended || room.status === RoomStatus.dissolved) {
    throw new NotFoundError('该 PK 已结束，暂时无法加入');
  }
  return toPublicRoom(prisma, room, userId);
}

async function createInviteCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const inviteCode = `PK${Math.floor(1000 + Math.random() * 9000)}`;
    const exists = await prisma.pkRoom.findUnique({
      where: { inviteCode },
      select: { id: true },
    });
    if (!exists) return inviteCode;
  }
  throw new ConflictError('邀请码生成失败，请重试');
}

export async function createRoom(userId: string, dto: CreateRoomDto) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('用户不存在');
  const room = await prisma.pkRoom.create({
    data: {
      inviteCode: await createInviteCode(),
      name: dto.name,
      status: dto.startDate <= dateString(new Date()) ? RoomStatus.active : RoomStatus.pending,
      startDate: dateOnly(dto.startDate),
      endDate: addDays(dto.startDate, dto.durationDays),
      durationDays: dto.durationDays,
      maxMembers: dto.maxMembers,
      creatorId: userId,
    },
    include: roomInclude,
  });
  return toPublicRoom(prisma, room, userId);
}

export async function joinRoom(roomId: string, userId: string, dto: JoinRoomDto) {
  assertOwnedObjectKey(dto.initialPhotoUrl, userId);
  return prisma.$transaction(
    async (tx) => {
      const room = await findRoomOrThrow(tx, roomId);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundError('用户不存在');
      if (room.status === RoomStatus.ended || room.status === RoomStatus.dissolved) {
        throw new ConflictError('该 PK 已无法加入');
      }
      if (room.members.length >= room.maxMembers) throw new ConflictError('该 PK 人数已满');
      if (room.members.some((item) => item.userId === userId)) {
        throw new ConflictError('你已经加入该 PK');
      }
      await tx.roomMember.create({
        data: {
          roomId,
          userId,
          initialWeightKg: new Prisma.Decimal(dto.initialWeightKg),
          initialPhotoKey: dto.initialPhotoUrl,
          currentWeightKg: new Prisma.Decimal(dto.initialWeightKg),
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { currentWeightKg: new Prisma.Decimal(dto.initialWeightKg) },
      });
      return toPublicRoom(tx, await findRoomOrThrow(tx, roomId), userId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getLeaderboard(roomId: string) {
  const room = await findRoomOrThrow(prisma, roomId);
  return {
    roomId,
    list: await loadRanking(prisma, room),
    myRank: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getSettlement(roomId: string, userId: string) {
  const room = await findRoomOrThrow(prisma, roomId);
  const ranking = await loadRanking(prisma, room);
  const mine = ranking.find((item) => item.userId === userId);
  return {
    roomId,
    roomName: room.name,
    status: room.status,
    myRank: mine?.rank ?? null,
    myScore: mine?.score ?? 0,
    myWeightLossPercent: mine?.weightLossPercent ?? 0,
    totalMembers: ranking.length,
    winners: ranking.slice(0, 3),
  };
}
