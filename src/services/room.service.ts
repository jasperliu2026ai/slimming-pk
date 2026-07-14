import { randomUUID } from 'crypto';
import { ConflictError, NotFoundError } from '../utils/AppError';
import { members, rooms, StoredMember, StoredRoom, users } from '../store/memoryStore';
import { CreateRoomDto, JoinRoomDto } from '../validators/room.schema';

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days - 1);
  return value.toISOString().slice(0, 10);
}

function progressFor(member: StoredMember, totalDays: number) {
  const weightLossPercent = Math.max(
    0,
    Number(
      (((member.initialWeightKg - member.currentWeightKg) / member.initialWeightKg) * 100).toFixed(
        2,
      ),
    ),
  );
  const checkinRate = Math.min(1, member.checkinDays / totalDays);
  const score = Math.min(100, Math.round(weightLossPercent * 14 + checkinRate * 30));
  return {
    userId: member.userId,
    nickname: member.nickname,
    avatarUrl: member.avatarUrl,
    score,
    weightLossPercent,
    checkinDays: member.checkinDays,
    totalDays,
    status: member.status,
  };
}

export function rankMembers(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new NotFoundError('PK 房间不存在');
  return members
    .filter((item) => item.roomId === roomId && item.status === 'active')
    .map((item) => progressFor(item, room.durationDays))
    .sort((a, b) => b.score - a.score || b.weightLossPercent - a.weightLossPercent)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function toPublicRoom(room: StoredRoom, userId: string) {
  const roomMembers = members.filter((item) => item.roomId === room.id && item.status === 'active');
  const myProgress = rankMembers(room.id).find((item) => item.userId === userId);
  return {
    ...room,
    memberCount: roomMembers.length,
    isMember: Boolean(myProgress),
    myProgress,
  };
}

export function listRooms(userId: string) {
  return [...rooms.values()]
    .map((room) => toPublicRoom(room, userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new NotFoundError('PK 房间不存在');
  return toPublicRoom(room, userId);
}

export function createRoom(userId: string, dto: CreateRoomDto) {
  const user = users.get(userId);
  if (!user) throw new NotFoundError('用户不存在');
  const room: StoredRoom = {
    id: `room-${randomUUID()}`,
    inviteCode: `PK${Math.floor(1000 + Math.random() * 9000)}`,
    name: dto.name,
    status: dto.startDate <= new Date().toISOString().slice(0, 10) ? 'active' : 'pending',
    startDate: dto.startDate,
    endDate: addDays(dto.startDate, dto.durationDays),
    durationDays: dto.durationDays,
    creatorId: userId,
    creatorNickname: user.nickname,
    createdAt: new Date().toISOString(),
  };
  rooms.set(room.id, room);
  return toPublicRoom(room, userId);
}

export function joinRoom(roomId: string, userId: string, dto: JoinRoomDto) {
  const room = rooms.get(roomId);
  const user = users.get(userId);
  if (!room) throw new NotFoundError('PK 房间不存在');
  if (!user) throw new NotFoundError('用户不存在');
  if (room.status === 'ended' || room.status === 'dissolved')
    throw new ConflictError('该 PK 已无法加入');
  if (
    members.some(
      (item) => item.roomId === roomId && item.userId === userId && item.status === 'active',
    )
  ) {
    throw new ConflictError('你已经加入该 PK');
  }
  members.push({
    roomId,
    userId,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    initialWeightKg: dto.initialWeightKg,
    initialPhotoUrl: dto.initialPhotoUrl,
    currentWeightKg: dto.initialWeightKg,
    checkinDays: 0,
    joinedAt: new Date().toISOString(),
    status: 'active',
  });
  user.currentWeightKg = dto.initialWeightKg;
  return toPublicRoom(room, userId);
}

export function getLeaderboard(roomId: string) {
  return { roomId, members: rankMembers(roomId), updatedAt: new Date().toISOString() };
}

export function getSettlement(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new NotFoundError('PK 房间不存在');
  const ranking = rankMembers(roomId);
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
