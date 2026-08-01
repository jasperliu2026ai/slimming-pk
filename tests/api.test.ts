process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-please-change';
process.env.DATABASE_URL =
  'mysql://slimming_pk:slimming_pk_dev_2026@127.0.0.1:3306/slimming_pk_test';
process.env.WECHAT_APPID = '';
process.env.WECHAT_APPSECRET = '';
process.env.COS_SECRET_ID = '';
process.env.COS_SECRET_KEY = '';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { shanghaiDateString } from '../src/utils/date';

describe('MVP API flow', () => {
  const app = createApp();
  let token = '';
  let userId = '';
  let roomId = '';

  it('logs in only after privacy consent', async () => {
    const refused = await request(app).post('/api/v1/auth/wx-login').send({ code: 'test' });
    expect(refused.status).toBe(400);

    const response = await request(app)
      .post('/api/v1/auth/wx-login')
      .send({ code: 'test-code', privacyAgreed: true });
    expect(response.status).toBe(200);
    token = response.body.data.token;
    userId = response.body.data.user.id;
    expect(token).toEqual(expect.any(String));
  });

  it('updates nickname and owned avatar through the mini-program PUT fallback', async () => {
    const avatarUrl = `Avatar/${userId}/2026-07/avatar.jpg`;
    const response = await request(app)
      .put('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: '新昵称', avatarUrl, preferredWeightUnit: 'jin' });

    expect(response.status).toBe(200);
    expect(response.body.data.nickname).toBe('新昵称');
    expect(response.body.data.avatarUrl).toBe(avatarUrl);
    expect(response.body.data.preferredWeightUnit).toBe('jin');
  });

  it('creates, switches and permanently deletes a password-protected test account', async () => {
    const denied = await request(app)
      .post('/api/v1/users/test-accounts/unlock')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong-password' });
    expect(denied.status).toBe(403);

    const unlocked = await request(app)
      .post('/api/v1/users/test-accounts/unlock')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'liujun110' });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.data.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: userId, isPrimary: true, isCurrent: true }),
      ]),
    );
    const adminToken = unlocked.body.data.adminToken;

    const created = await request(app)
      .post('/api/v1/users/test-accounts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-test-admin-token', adminToken)
      .send({ nickname: '测试小号' });
    expect(created.status).toBe(201);
    expect(created.body.data.user.nickname).toBe('测试小号');
    expect(created.body.data.user.isTestAccount).toBe(true);
    const testAccountId = created.body.data.user.id;
    const testAccountToken = created.body.data.token;

    const switchedBack = await request(app)
      .post('/api/v1/users/test-accounts/switch')
      .set('Authorization', `Bearer ${testAccountToken}`)
      .set('x-test-admin-token', adminToken)
      .send({ accountId: userId });
    expect(switchedBack.status).toBe(200);
    expect(switchedBack.body.data.user.id).toBe(userId);

    const cannotDeletePrimary = await request(app)
      .delete(`/api/v1/users/test-accounts/${userId}`)
      .set('Authorization', `Bearer ${testAccountToken}`)
      .set('x-test-admin-token', adminToken);
    expect(cannotDeletePrimary.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/v1/users/test-accounts/${testAccountId}`)
      .set('Authorization', `Bearer ${testAccountToken}`)
      .set('x-test-admin-token', adminToken);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);
    expect(deleted.body.data.fallbackAuth.user.id).toBe(userId);
    token = deleted.body.data.fallbackAuth.token;

    const removed = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${testAccountToken}`);
    expect(removed.status).toBe(404);
  });

  it('creates a room and automatically joins the creator', async () => {
    const created = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '测试 PK',
        durationDays: 7,
        startDate: shanghaiDateString(),
        initialWeightKg: 63.2,
      });
    expect(created.status).toBe(201);
    roomId = created.body.data.id;
    expect(created.body.data.isMember).toBe(true);
    expect(created.body.data.memberCount).toBe(1);
    expect(created.body.data.myInitialWeightKg).toBe(63.2);
    expect(created.body.data.myCurrentWeightKg).toBe(63.2);
  });

  it('requires creator approval before an applicant becomes a member', async () => {
    const applicantId = 'join-request-applicant';
    await prisma.user.upsert({
      where: { id: applicantId },
      update: {},
      create: {
        id: applicantId,
        openid: 'join-request-applicant-openid',
        nickname: '申请加入者',
      },
    });
    const applicantToken = jwt.sign({ userId: applicantId }, process.env.JWT_SECRET!);

    const discoverable = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${applicantToken}`);
    const availableRoom = discoverable.body.data.list.find(
      (item: { id: string }) => item.id === roomId,
    );
    expect(availableRoom.isMember).toBe(false);
    expect(availableRoom.canApply).toBe(true);

    const applied = await request(app)
      .post(`/api/v1/rooms/${roomId}/join-requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        initialWeightKg: 66.5,
      });
    expect(applied.status).toBe(201);
    expect(applied.body.data.status).toBe('pending');

    const waiting = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${applicantToken}`);
    const waitingRoom = waiting.body.data.list.find((item: { id: string }) => item.id === roomId);
    expect(waitingRoom.myJoinRequestStatus).toBe('pending');
    expect(waitingRoom.canApply).toBe(false);

    const forbidden = await request(app)
      .get(`/api/v1/rooms/${roomId}/join-requests`)
      .set('Authorization', `Bearer ${applicantToken}`);
    expect(forbidden.status).toBe(403);

    const pending = await request(app)
      .get(`/api/v1/rooms/${roomId}/join-requests`)
      .set('Authorization', `Bearer ${token}`);
    expect(pending.status).toBe(200);
    expect(pending.body.data.list).toHaveLength(1);

    // 模拟微信小程序：wx.request 将 PATCH 转成携带 override 头的 PUT。
    const approved = await request(app)
      .put(`/api/v1/rooms/${roomId}/join-requests/${applied.body.data.id}`)
      .set('X-HTTP-Method-Override', 'PATCH')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('approved');

    const joined = await request(app)
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${applicantToken}`);
    expect(joined.body.data.isMember).toBe(true);
    expect(joined.body.data.myInitialWeightKg).toBe(66.5);
  });

  it('protects the upload endpoint and reports missing COS credentials', async () => {
    const unauthorized = await request(app)
      .post('/api/v1/uploads/images')
      .field('category', 'checkin')
      .attach('file', Buffer.from('fake-image'), {
        filename: 'weight.png',
        contentType: 'image/png',
      });
    expect(unauthorized.status).toBe(401);

    const notConfigured = await request(app)
      .post('/api/v1/uploads/images')
      .set('Authorization', `Bearer ${token}`)
      .field('category', 'checkin')
      .attach('file', Buffer.from('fake-image'), {
        filename: 'weight.png',
        contentType: 'image/png',
      });
    expect(notConfigured.status).toBe(503);
  });

  it('upserts a checkin and returns a privacy-safe leaderboard', async () => {
    const checked = await request(app)
      .post(`/api/v1/rooms/${roomId}/checkins`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        weightKg: 62.9,
        dietText: '少油',
        dietPhotoUrls: [],
        exercisePhotoUrls: [],
      });
    expect(checked.status).toBe(200);

    const updated = await request(app)
      .post(`/api/v1/rooms/${roomId}/checkins`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        weightKg: 62.8,
        weightPhotoUrl: 'local://today-updated',
        exerciseText: '走路',
        dietPhotoUrls: [],
        exercisePhotoUrls: [],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.id).toBe(checked.body.data.id);

    const foreignPhoto = await request(app)
      .post(`/api/v1/rooms/${roomId}/checkins`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        weightKg: 62.8,
        weightPhotoUrl: 'checkin/another-user/2026-07/not-owned.jpg',
        dietPhotoUrls: [],
        exercisePhotoUrls: [],
      });
    expect(foreignPhoto.status).toBe(403);

    const checkins = await request(app)
      .get(`/api/v1/rooms/${roomId}/checkins`)
      .set('Authorization', `Bearer ${token}`);
    expect(checkins.body.data).toHaveLength(1);
    expect(checkins.body.data[0].dietText).toBe('少油');
    expect(checkins.body.data[0].exerciseText).toBe('走路');

    await prisma.user.upsert({
      where: { id: 'ranking-many-checkins' },
      update: {},
      create: {
        id: 'ranking-many-checkins',
        openid: 'ranking-many-checkins-openid',
        nickname: '打卡多但减重少',
      },
    });
    await prisma.user.upsert({
      where: { id: 'ranking-tied-loss' },
      update: {},
      create: {
        id: 'ranking-tied-loss',
        openid: 'ranking-tied-loss-openid',
        nickname: '同减重',
      },
    });
    await prisma.roomMember.createMany({
      data: [
        {
          roomId,
          userId: 'ranking-many-checkins',
          initialWeightKg: 80,
          currentWeightKg: 79.7,
          initialPhotoKey: 'local://ranking-many-checkins',
        },
        {
          roomId,
          userId: 'ranking-tied-loss',
          initialWeightKg: 70,
          currentWeightKg: 69.6,
          initialPhotoKey: 'local://ranking-tied-loss',
        },
      ],
    });
    await prisma.checkin.createMany({
      data: Array.from({ length: 7 }, (_, index) => ({
        roomId,
        userId: 'ranking-many-checkins',
        checkinDate: new Date(Date.UTC(2026, 0, index + 1)),
        dietPhotoUrls: [],
        exercisePhotoUrls: [],
      })),
    });

    const leaderboard = await request(app)
      .get(`/api/v1/rooms/${roomId}/leaderboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(leaderboard.status).toBe(200);
    const [first, second, third] = leaderboard.body.data.list;
    expect(first).not.toHaveProperty('initialWeightKg');
    expect(first).not.toHaveProperty('currentWeightKg');
    expect(first.weightLossKg).toBe(0.4);
    expect(first.score).toBe(40);
    expect(first).toHaveProperty('weightLossPercent');
    expect(first.rank).toBe(1);
    expect(second.weightLossKg).toBe(0.4);
    expect(second.rank).toBe(1);
    expect(third.nickname).toBe('打卡多但减重少');
    expect(third.weightLossKg).toBe(0.3);
    expect(third.checkinDays).toBe(7);
    expect(third.rank).toBe(3);

    const room = await request(app)
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(room.body.data.myInitialWeightKg).toBe(63.2);
    expect(room.body.data.myCurrentWeightKg).toBe(62.8);
  });

  it('accepts custom challenge days and team capacity beyond the former presets', async () => {
    const created = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '自定义配置 PK',
        durationDays: 45,
        maxMembers: 12,
        startDate: shanghaiDateString(),
        initialWeightKg: 63.2,
        initialPhotoUrl: 'local://custom-room-initial',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.durationDays).toBe(45);
    expect(created.body.data.maxMembers).toBe(12);
  });

  it('hides the join entrance and rejects new applications when the room is full', async () => {
    const createApplicant = async (id: string, nickname: string) => {
      await prisma.user.upsert({
        where: { id },
        update: {},
        create: {
          id,
          openid: `${id}-openid`,
          nickname,
        },
      });
      return jwt.sign({ userId: id }, process.env.JWT_SECRET!);
    };

    const finalMemberToken = await createApplicant('final-capacity-member', '最后一位成员');
    const finalApplication = await request(app)
      .post(`/api/v1/rooms/${roomId}/join-requests`)
      .set('Authorization', `Bearer ${finalMemberToken}`)
      .send({
        initialWeightKg: 58.8,
        initialPhotoUrl: 'local://final-capacity-member',
      });
    expect(finalApplication.status).toBe(201);

    const approval = await request(app)
      .patch(`/api/v1/rooms/${roomId}/join-requests/${finalApplication.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'approve' });
    expect(approval.status).toBe(200);

    const overflowToken = await createApplicant('overflow-applicant', '满员后申请者');
    const rooms = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${overflowToken}`);
    const fullRoom = rooms.body.data.list.find((item: { id: string }) => item.id === roomId);
    expect(fullRoom.isFull).toBe(true);
    expect(fullRoom.canApply).toBe(false);

    const blocked = await request(app)
      .post(`/api/v1/rooms/${roomId}/join-requests`)
      .set('Authorization', `Bearer ${overflowToken}`)
      .send({
        initialWeightKg: 72.1,
        initialPhotoUrl: 'local://overflow-applicant',
      });
    expect(blocked.status).toBe(409);
  });

  it('ends, archives, restores and restarts a PK with invitations for former members', async () => {
    const ended = await request(app)
      .post(`/api/v1/rooms/${roomId}/end`)
      .set('Authorization', `Bearer ${token}`);
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe('ended');

    const archived = await request(app)
      .post(`/api/v1/rooms/${roomId}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(archived.status).toBe(200);

    const normalList = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${token}`);
    expect(normalList.body.data.list.some((item: { id: string }) => item.id === roomId)).toBe(
      false,
    );

    const archivedList = await request(app)
      .get('/api/v1/rooms?archived=true')
      .set('Authorization', `Bearer ${token}`);
    expect(archivedList.body.data.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: roomId, isArchived: true })]),
    );

    const restored = await request(app)
      .post(`/api/v1/rooms/${roomId}/restore`)
      .set('Authorization', `Bearer ${token}`);
    expect(restored.status).toBe(200);

    const formerMemberToken = jwt.sign(
      { userId: 'join-request-applicant' },
      process.env.JWT_SECRET!,
    );
    const restarted = await request(app)
      .post(`/api/v1/rooms/${roomId}/restart`)
      .set('Authorization', `Bearer ${formerMemberToken}`)
      .send({
        name: '重新出发 PK',
        durationDays: 14,
        maxMembers: 8,
        startDate: shanghaiDateString(),
        initialWeightKg: 65.8,
      });
    expect(restarted.status).toBe(201);
    expect(restarted.body.data.room.isCreator).toBe(true);
    expect(restarted.body.data.room.memberCount).toBe(1);
    expect(restarted.body.data.invitedCount).toBeGreaterThan(0);

    const invitations = await request(app)
      .get('/api/v1/rooms/restart-invitations')
      .set('Authorization', `Bearer ${token}`);
    expect(invitations.status).toBe(200);
    expect(invitations.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: restarted.body.data.room.id,
          roomName: '重新出发 PK',
        }),
      ]),
    );
    const invitation = invitations.body.data.list.find(
      (item: { roomId: string }) => item.roomId === restarted.body.data.room.id,
    );

    const accepted = await request(app)
      .put(`/api/v1/rooms/restart-invitations/${invitation.id}`)
      .set('X-HTTP-Method-Override', 'PATCH')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('accepted');

    const restartedRoom = await request(app)
      .get(`/api/v1/rooms/${restarted.body.data.room.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(restartedRoom.body.data.isMember).toBe(true);
    expect(restartedRoom.body.data.memberCount).toBe(2);
  });

  it('transfers owned rooms on account deletion without deleting other members data', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ownerId = `delete-owner-${suffix}`;
    const survivorId = `delete-survivor-${suffix}`;
    await prisma.user.createMany({
      data: [
        { id: ownerId, openid: `${ownerId}-openid`, nickname: '待注销创建者' },
        { id: survivorId, openid: `${survivorId}-openid`, nickname: '保留成员' },
      ],
    });
    const startDate = new Date(`${shanghaiDateString()}T00:00:00.000Z`);
    const transferredRoom = await prisma.pkRoom.create({
      data: {
        inviteCode: `D${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        name: '注销转让测试',
        status: 'active',
        startDate,
        endDate: startDate,
        durationDays: 1,
        creatorId: ownerId,
        members: {
          create: [
            { userId: ownerId, initialWeightKg: 70, currentWeightKg: 70, initialPhotoKey: '' },
            { userId: survivorId, initialWeightKg: 65, currentWeightKg: 64, initialPhotoKey: '' },
          ],
        },
        checkins: {
          create: [
            {
              userId: ownerId,
              checkinDate: startDate,
              weightKg: 69,
              dietPhotoUrls: [],
              exercisePhotoUrls: [],
            },
            {
              userId: survivorId,
              checkinDate: startDate,
              weightKg: 64,
              dietPhotoUrls: [],
              exercisePhotoUrls: [],
            },
          ],
        },
      },
    });
    const emptyRoom = await prisma.pkRoom.create({
      data: {
        inviteCode: `E${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        name: '注销空房测试',
        status: 'active',
        startDate,
        endDate: startDate,
        durationDays: 1,
        creatorId: ownerId,
        members: {
          create: {
            userId: ownerId,
            initialWeightKg: 70,
            currentWeightKg: 70,
            initialPhotoKey: '',
          },
        },
      },
    });
    const ownerToken = jwt.sign({ userId: ownerId }, process.env.JWT_SECRET!);

    const deleted = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toMatchObject({
      deleted: true,
      transferredRoomCount: 1,
      deletedEmptyRoomCount: 1,
    });
    expect(await prisma.user.findUnique({ where: { id: ownerId } })).toBeNull();
    expect(await prisma.pkRoom.findUnique({ where: { id: emptyRoom.id } })).toBeNull();
    const preservedRoom = await prisma.pkRoom.findUnique({
      where: { id: transferredRoom.id },
      include: { members: true, checkins: true },
    });
    expect(preservedRoom?.creatorId).toBe(survivorId);
    expect(preservedRoom?.members.map((member) => member.userId)).toEqual([survivorId]);
    expect(preservedRoom?.checkins.map((checkin) => checkin.userId)).toEqual([survivorId]);

    await prisma.pkRoom.delete({ where: { id: transferredRoom.id } });
    await prisma.user.delete({ where: { id: survivorId } });
  });
});
