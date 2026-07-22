process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-please-change';
process.env.DATABASE_URL =
  'mysql://slimming_pk:slimming_pk_dev_2026@127.0.0.1:3306/slimming_pk_test';
process.env.WECHAT_APPID = '';
process.env.WECHAT_APPSECRET = '';
process.env.COS_SECRET_ID = '';
process.env.COS_SECRET_KEY = '';

import request from 'supertest';
import { createApp } from '../src/app';

describe('MVP API flow', () => {
  const app = createApp();
  let token = '';
  let roomId = '';

  it('logs in only after privacy consent', async () => {
    const refused = await request(app).post('/api/v1/auth/wx-login').send({ code: 'test' });
    expect(refused.status).toBe(400);

    const response = await request(app)
      .post('/api/v1/auth/wx-login')
      .send({ code: 'test-code', privacyAgreed: true });
    expect(response.status).toBe(200);
    token = response.body.data.token;
    expect(token).toEqual(expect.any(String));
  });

  it('creates and joins a room', async () => {
    const created = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试 PK', durationDays: 7, startDate: '2026-07-14' });
    expect(created.status).toBe(201);
    roomId = created.body.data.id;

    const joined = await request(app)
      .post(`/api/v1/rooms/${roomId}/join`)
      .set('Authorization', `Bearer ${token}`)
      .send({ initialWeightKg: 63.2, initialPhotoUrl: 'local://initial' });
    expect(joined.status).toBe(200);
    expect(joined.body.data.isMember).toBe(true);
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
        weightPhotoUrl: 'local://today',
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

    const leaderboard = await request(app)
      .get(`/api/v1/rooms/${roomId}/leaderboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(leaderboard.status).toBe(200);
    const first = leaderboard.body.data.list[0];
    expect(first).not.toHaveProperty('initialWeightKg');
    expect(first).not.toHaveProperty('currentWeightKg');
    expect(first).toHaveProperty('weightLossPercent');
  });
});
