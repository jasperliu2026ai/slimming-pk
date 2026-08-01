import {
  JoinRequestStatus,
  MemberStatus,
  Prisma,
  PrismaClient,
  RestartInvitationStatus,
  RoomStatus,
} from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { dateOnly, shanghaiDateString } from '../utils/date';
import { CreateRoomDto, JoinRoomDto } from '../validators/room.schema';
import { assertOwnedObjectKey, getSignedAvatarUrl } from './storage.service';
import { checkWechatUserText } from './wechat-security.service';

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
      // 实际减重必须保留正负号：增重成员应排在体重未变化的成员之后。
      const weightLossKg = Number(member.initialWeightKg.minus(member.currentWeightKg).toFixed(2));
      const weightLossPercent = Number(((weightLossKg / initialWeightKg) * 100).toFixed(2));
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
    isArchived: Boolean(myMembership?.archivedAt),
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

export async function listRooms(userId: string, archived = false) {
  const rooms = await prisma.pkRoom.findMany({
    where: {
      ...(archived
        ? {
            members: {
              some: { userId, status: MemberStatus.active, archivedAt: { not: null } },
            },
          }
        : {
            OR: [
              { creatorId: userId },
              {
                members: {
                  some: { userId, status: MemberStatus.active, archivedAt: null },
                },
              },
              { status: { in: [RoomStatus.pending, RoomStatus.active] } },
            ],
          }),
    },
    include: roomInclude,
    orderBy: { createdAt: 'desc' },
  });
  const publicRooms = await Promise.all(rooms.map((room) => toPublicRoom(prisma, room, userId)));
  return publicRooms.filter((room) => {
    if (archived) return room.isMember && room.isArchived;
    return (
      (room.isMember && !room.isArchived) ||
      (!room.isMember && (room.status === RoomStatus.pending || room.status === RoomStatus.active))
    );
  });
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
  await checkWechatUserText(userId, [dto.name], 2);
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

export async function endRoom(roomId: string, userId: string) {
  const room = await findRoomOrThrow(prisma, roomId);
  if (room.creatorId !== userId) throw new ForbiddenError('只有 PK 创建者可以提前结束');
  if (effectiveRoomStatus(room) !== RoomStatus.active) {
    throw new ConflictError('只有进行中的 PK 可以提前结束');
  }
  await prisma.pkRoom.update({
    where: { id: roomId },
    data: { status: RoomStatus.ended, endDate: dateOnly(shanghaiDateString()) },
  });
  return toPublicRoom(prisma, await findRoomOrThrow(prisma, roomId), userId);
}

export async function archiveRoom(roomId: string, userId: string) {
  const room = await findRoomOrThrow(prisma, roomId);
  if (effectiveRoomStatus(room) !== RoomStatus.ended) {
    throw new ConflictError('只有已结束的 PK 可以归档');
  }
  const membership = room.members.find((item) => item.userId === userId);
  if (!membership) throw new ForbiddenError('只有参与成员可以归档该 PK');
  await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { archivedAt: new Date() },
  });
  return { roomId, archived: true };
}

export async function restoreRoom(roomId: string, userId: string) {
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { archivedAt: true },
  });
  if (!membership) throw new ForbiddenError('你不是该 PK 的参与成员');
  if (!membership.archivedAt) throw new ConflictError('该 PK 尚未归档');
  await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { archivedAt: null },
  });
  return { roomId, archived: false };
}

export async function restartRoom(sourceRoomId: string, userId: string, dto: CreateRoomDto) {
  assertOwnedObjectKey(dto.initialPhotoUrl, userId);
  await checkWechatUserText(userId, [dto.name], 2);
  const inviteCode = await createInviteCode();
  return prisma.$transaction(
    async (tx) => {
      const sourceRoom = await findRoomOrThrow(tx, sourceRoomId);
      if (effectiveRoomStatus(sourceRoom) !== RoomStatus.ended) {
        throw new ConflictError('只有已结束的 PK 可以再次发起');
      }
      const sourceMember = sourceRoom.members.find((item) => item.userId === userId);
      if (!sourceMember) throw new ForbiddenError('只有原 PK 成员可以再次发起');

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
          sourceRoomId,
        },
      });
      const weight = new Prisma.Decimal(dto.initialWeightKg);
      await Promise.all([
        tx.roomMember.create({
          data: {
            roomId: room.id,
            userId,
            initialWeightKg: weight,
            currentWeightKg: weight,
            initialPhotoKey: dto.initialPhotoUrl,
          },
        }),
        tx.user.update({
          where: { id: userId },
          data: { currentWeightKg: weight },
        }),
      ]);
      const inviteeIds = sourceRoom.members
        .map((member) => member.userId)
        .filter((memberId) => memberId !== userId);
      if (inviteeIds.length > 0) {
        await tx.restartInvitation.createMany({
          data: inviteeIds.map((inviteeId) => ({
            roomId: room.id,
            inviterId: userId,
            inviteeId,
          })),
        });
      }
      return {
        room: await toPublicRoom(tx, await findRoomOrThrow(tx, room.id), userId),
        invitedCount: inviteeIds.length,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listRestartInvitations(userId: string) {
  const invitations = await prisma.restartInvitation.findMany({
    where: { inviteeId: userId, status: RestartInvitationStatus.pending },
    include: {
      inviter: { select: { nickname: true } },
      room: {
        select: {
          id: true,
          name: true,
          inviteCode: true,
          startDate: true,
          durationDays: true,
          maxMembers: true,
          sourceRoom: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return invitations.map((invitation) => ({
    id: invitation.id,
    roomId: invitation.roomId,
    roomName: invitation.room.name,
    sourceRoomName: invitation.room.sourceRoom?.name ?? '',
    inviteCode: invitation.room.inviteCode,
    inviterNickname: invitation.inviter.nickname,
    startDate: dateString(invitation.room.startDate),
    durationDays: invitation.room.durationDays,
    maxMembers: invitation.room.maxMembers,
    status: invitation.status,
    createdAt: invitation.createdAt.toISOString(),
  }));
}

export async function decideRestartInvitation(
  invitationId: string,
  userId: string,
  action: 'accept' | 'decline',
) {
  return prisma.$transaction(
    async (tx) => {
      const invitation = await tx.restartInvitation.findFirst({
        where: { id: invitationId, inviteeId: userId },
        include: { room: { include: roomInclude } },
      });
      if (!invitation) throw new NotFoundError('重来 PK 邀请不存在');
      if (invitation.status !== RestartInvitationStatus.pending) {
        throw new ConflictError('该邀请已经处理');
      }
      if (action === 'decline') {
        await tx.restartInvitation.update({
          where: { id: invitationId },
          data: { status: RestartInvitationStatus.declined, decidedAt: new Date() },
        });
        return { invitationId, roomId: invitation.roomId, status: 'declined' as const };
      }
      const roomStatus = effectiveRoomStatus(invitation.room);
      if (roomStatus === RoomStatus.ended || roomStatus === RoomStatus.dissolved) {
        throw new ConflictError('这局 PK 已无法加入');
      }
      if (invitation.room.members.length >= invitation.room.maxMembers) {
        throw new ConflictError('这局 PK 人数已满');
      }
      if (invitation.room.members.some((member) => member.userId === userId)) {
        throw new ConflictError('你已经加入这局 PK');
      }
      if (!invitation.room.sourceRoomId) throw new ConflictError('原 PK 信息不存在');
      const sourceMembership = await tx.roomMember.findUnique({
        where: { roomId_userId: { roomId: invitation.room.sourceRoomId, userId } },
      });
      if (!sourceMembership) throw new ForbiddenError('你不是原 PK 成员');
      await Promise.all([
        tx.roomMember.create({
          data: {
            roomId: invitation.roomId,
            userId,
            initialWeightKg: sourceMembership.currentWeightKg,
            currentWeightKg: sourceMembership.currentWeightKg,
            initialPhotoKey: '',
          },
        }),
        tx.user.update({
          where: { id: userId },
          data: { currentWeightKg: sourceMembership.currentWeightKg },
        }),
        tx.restartInvitation.update({
          where: { id: invitationId },
          data: { status: RestartInvitationStatus.accepted, decidedAt: new Date() },
        }),
      ]);
      return { invitationId, roomId: invitation.roomId, status: 'accepted' as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
