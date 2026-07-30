import { JoinRequestStatus, MemberStatus, Prisma, PrismaClient, RoomStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { dateOnly, shanghaiDateString } from '../utils/date';
import { CreateRoomDto, JoinRoomDto } from '../validators/room.schema';
import { assertOwnedObjectKey, getSignedAvatarUrl } from './storage.service';

type DbClient = Prisma.TransactionClient | PrismaClient;

const roomInclude = {
  creator: true,
  members: {
    where: { status: MemberStatus.active },
    include: { user: true },
  },
  joinRequests: {
    select: { id: true, userId: true, status: true },
  },
} satisfies Prisma.PkRoomInclude;

type RoomWithMembers = Prisma.PkRoomGetPayload<{ include: typeof roomInclude }>;

function dateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = dateOnly(date);
  value.setUTCDate(value.getUTCDate() + days - 1);
  return value;
}

function effectiveRoomStatus(room: Pick<RoomWithMembers, 'status' | 'startDate' | 'endDate'>) {
  if (room.status === RoomStatus.dissolved) return RoomStatus.dissolved;
  if (room.status === RoomStatus.ended) return RoomStatus.ended;
  const today = shanghaiDateString();
  if (today < dateString(room.startDate)) return RoomStatus.pending;
  if (today > dateString(room.endDate)) return RoomStatus.ended;
  return RoomStatus.active;
}

async function loadRanking(client: DbClient, room: RoomWithMembers, includeAvatars = true) {
  const counts = await client.checkin.groupBy({
    by: ['userId'],
    where: { roomId: room.id },
    _count: { _all: true },
  });
  const countByUser = new Map(counts.map((item) => [item.userId, item._count._all]));
  const ranking = await Promise.all(
    room.members.map(async (member) => {
      const initialWeightKg = Number(member.initialWeightKg);
      const checkinDays = countByUser.get(member.userId) ?? 0;
      const weightLossKg = Math.max(
        0,
        Number(member.initialWeightKg.minus(member.currentWeightKg).toFixed(2)),
      );
      const weightLossPercent = Math.max(
        0,
        Number(((weightLossKg / initialWeightKg) * 100).toFixed(2)),
      );
      let avatarUrl = '';
      if (includeAvatars) {
        try {
          avatarUrl = await getSignedAvatarUrl(member.user.avatarUrl);
        } catch (error) {
          logger.warn({ error, userId: member.userId }, 'failed to sign leaderboard avatar');
        }
      }
      return {
        userId: member.userId,
        nickname: member.user.nickname,
        avatarUrl,
        // 兼容旧客户端：积分只由实际减重产生，1kg = 100 分。
        score: Math.round(weightLossKg * 100),
        weightLossKg,
        weightLossPercent,
        checkinDays,
        totalDays: room.durationDays,
        status: member.status,
      };
    }),
  );
  ranking.sort((a, b) => b.weightLossKg - a.weightLossKg);
  let previousLossKg: number | null = null;
  let previousRank = 0;
  return ranking.map((item, index) => {
    const rank = previousLossKg === item.weightLossKg ? previousRank : index + 1;
    previousLossKg = item.weightLossKg;
    previousRank = rank;
    return { ...item, rank };
  });
}

async function toPublicRoom(client: DbClient, room: RoomWithMembers, userId: string) {
  // 房间列表与详情不展示成员头像，避免每次刷新 PK 赛场都批量签名 COS URL。
  const ranking = await loadRanking(client, room, false);
  const myProgress = ranking.find((item) => item.userId === userId);
  const myMembership = room.members.find((item) => item.userId === userId);
  const status = effectiveRoomStatus(room);
  const isCreator = room.creatorId === userId;
  const isFull = room.members.length >= room.maxMembers;
  const myJoinRequest = room.joinRequests.find((item) => item.userId === userId);
  return {
    id: room.id,
    inviteCode: room.inviteCode,
    name: room.name,
    status,
    startDate: dateString(room.startDate),
    endDate: dateString(room.endDate),
    durationDays: room.durationDays,
    maxMembers: room.maxMembers,
    creatorId: room.creatorId,
    creatorNickname: room.creator.nickname,
    createdAt: room.createdAt.toISOString(),
    memberCount: room.members.length,
    isMember: Boolean(myProgress),
    isCreator,
    isFull,
    canApply:
      !myProgress &&
      !isCreator &&
      !isFull &&
      (status === RoomStatus.pending || status === RoomStatus.active) &&
      myJoinRequest?.status !== JoinRequestStatus.pending,
    myJoinRequestStatus: myJoinRequest?.status ?? null,
    pendingRequestCount: isCreator
      ? room.joinRequests.filter((item) => item.status === JoinRequestStatus.pending).length
      : 0,
    myProgress,
    // 仅返回当前登录用户自己的绝对体重，避免排行榜泄露其他成员隐私。
    myInitialWeightKg: myMembership ? Number(myMembership.initialWeightKg) : undefined,
    myCurrentWeightKg: myMembership ? Number(myMembership.currentWeightKg) : undefined,
  };
}

async function findRoomOrThrow(client: DbClient, roomId: string) {
  const room = await client.pkRoom.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!room) throw new NotFoundError('PK 房间不存在');
  return room;
}

export async function listRooms(userId: string) {
  const rooms = await prisma.pkRoom.findMany({
    where: {
      OR: [
        { creatorId: userId },
        { members: { some: { userId, status: MemberStatus.active } } },
        { status: { in: [RoomStatus.pending, RoomStatus.active] } },
      ],
    },
    include: roomInclude,
    orderBy: { createdAt: 'desc' },
  });
  const publicRooms = await Promise.all(rooms.map((room) => toPublicRoom(prisma, room, userId)));
  return publicRooms.filter(
    (room) =>
      room.isMember ||
      room.isCreator ||
      room.status === RoomStatus.pending ||
      room.status === RoomStatus.active,
  );
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
  const status = effectiveRoomStatus(room);
  if (status === RoomStatus.ended || status === RoomStatus.dissolved) {
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
  assertOwnedObjectKey(dto.initialPhotoUrl, userId);
  const inviteCode = await createInviteCode();
  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundError('用户不存在');
      const room = await tx.pkRoom.create({
        data: {
          inviteCode,
          name: dto.name,
          status: dto.startDate <= shanghaiDateString() ? RoomStatus.active : RoomStatus.pending,
          startDate: dateOnly(dto.startDate),
          endDate: addDays(dto.startDate, dto.durationDays),
          durationDays: dto.durationDays,
          maxMembers: dto.maxMembers,
          creatorId: userId,
        },
      });
      const weight = new Prisma.Decimal(dto.initialWeightKg);
      await Promise.all([
        tx.roomMember.create({
          data: {
            roomId: room.id,
            userId,
            initialWeightKg: weight,
            initialPhotoKey: dto.initialPhotoUrl,
            currentWeightKg: weight,
          },
        }),
        tx.user.update({
          where: { id: userId },
          data: { currentWeightKg: weight },
        }),
      ]);
      return toPublicRoom(tx, await findRoomOrThrow(tx, room.id), userId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createJoinRequest(roomId: string, userId: string, dto: JoinRoomDto) {
  assertOwnedObjectKey(dto.initialPhotoUrl, userId);
  return prisma.$transaction(
    async (tx) => {
      const room = await findRoomOrThrow(tx, roomId);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundError('用户不存在');
      const status = effectiveRoomStatus(room);
      if (status === RoomStatus.ended || status === RoomStatus.dissolved) {
        throw new ConflictError('该 PK 已无法加入');
      }
      if (room.members.length >= room.maxMembers) throw new ConflictError('该 PK 人数已满');
      if (room.members.some((item) => item.userId === userId)) {
        throw new ConflictError('你已经加入该 PK');
      }
      const existing = await tx.joinRequest.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (existing?.status === JoinRequestStatus.pending) {
        throw new ConflictError('你的加入申请正在等待创建者审核');
      }
      if (existing?.status === JoinRequestStatus.approved) {
        throw new ConflictError('你的加入申请已经通过');
      }
      const request = await tx.joinRequest.upsert({
        where: { roomId_userId: { roomId, userId } },
        update: {
          initialWeightKg: new Prisma.Decimal(dto.initialWeightKg),
          initialPhotoKey: dto.initialPhotoUrl,
          status: JoinRequestStatus.pending,
          decidedAt: null,
        },
        create: {
          roomId,
          userId,
          initialWeightKg: new Prisma.Decimal(dto.initialWeightKg),
          initialPhotoKey: dto.initialPhotoUrl,
        },
      });
      return {
        id: request.id,
        roomId: request.roomId,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listJoinRequests(roomId: string, creatorId: string) {
  const room = await prisma.pkRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      creatorId: true,
      maxMembers: true,
      members: {
        where: { status: MemberStatus.active },
        select: { userId: true },
      },
    },
  });
  if (!room) throw new NotFoundError('PK 房间不存在');
  if (room.creatorId !== creatorId) throw new ForbiddenError('只有创建者可以查看加入申请');
  const requests = await prisma.joinRequest.findMany({
    where: { roomId, status: JoinRequestStatus.pending },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  return {
    roomId,
    isFull: room.members.length >= room.maxMembers,
    list: await Promise.all(
      requests.map(async (request) => {
        let avatarUrl = '';
        try {
          avatarUrl = await getSignedAvatarUrl(request.user.avatarUrl);
        } catch (error) {
          logger.warn({ error, userId: request.userId }, 'failed to sign applicant avatar');
        }
        return {
          id: request.id,
          userId: request.userId,
          nickname: request.user.nickname,
          avatarUrl,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
        };
      }),
    ),
  };
}

export async function decideJoinRequest(
  roomId: string,
  requestId: string,
  creatorId: string,
  action: 'approve' | 'reject',
) {
  return prisma.$transaction(
    async (tx) => {
      const room = await findRoomOrThrow(tx, roomId);
      if (room.creatorId !== creatorId) throw new ForbiddenError('只有创建者可以处理加入申请');
      const request = await tx.joinRequest.findFirst({ where: { id: requestId, roomId } });
      if (!request) throw new NotFoundError('加入申请不存在');
      if (request.status !== JoinRequestStatus.pending) {
        throw new ConflictError('该申请已经处理');
      }
      if (action === 'reject') {
        const rejected = await tx.joinRequest.update({
          where: { id: request.id },
          data: { status: JoinRequestStatus.rejected, decidedAt: new Date() },
        });
        return { id: rejected.id, roomId, status: rejected.status };
      }
      const status = effectiveRoomStatus(room);
      if (status === RoomStatus.ended || status === RoomStatus.dissolved) {
        throw new ConflictError('该 PK 已无法加入');
      }
      if (room.members.length >= room.maxMembers) throw new ConflictError('该 PK 人数已满');
      if (room.members.some((item) => item.userId === request.userId)) {
        throw new ConflictError('该用户已经加入 PK');
      }
      await tx.roomMember.upsert({
        where: { roomId_userId: { roomId, userId: request.userId } },
        update: {
          initialWeightKg: request.initialWeightKg,
          initialPhotoKey: request.initialPhotoKey,
          currentWeightKg: request.initialWeightKg,
          status: MemberStatus.active,
          joinedAt: new Date(),
        },
        create: {
          roomId,
          userId: request.userId,
          initialWeightKg: request.initialWeightKg,
          initialPhotoKey: request.initialPhotoKey,
          currentWeightKg: request.initialWeightKg,
        },
      });
      await Promise.all([
        tx.user.update({
          where: { id: request.userId },
          data: { currentWeightKg: request.initialWeightKg },
        }),
        tx.joinRequest.update({
          where: { id: request.id },
          data: { status: JoinRequestStatus.approved, decidedAt: new Date() },
        }),
      ]);
      return { id: request.id, roomId, status: JoinRequestStatus.approved };
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
    status: effectiveRoomStatus(room),
    myRank: mine?.rank ?? null,
    myScore: mine?.score ?? 0,
    myWeightLossKg: mine?.weightLossKg ?? 0,
    myWeightLossPercent: mine?.weightLossPercent ?? 0,
    totalMembers: ranking.length,
    winners: ranking.slice(0, 3),
  };
}
