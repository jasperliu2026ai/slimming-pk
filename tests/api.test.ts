process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-please-change';
process.env.DATABASE_URL = 'mysql://root:root@localhost:3306/fitpk';

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

  it('upserts a checkin and returns a privacy-safe leaderboard', async () => {
    const checked = await request(app)
      .post(`/api/v1/rooms/${roomId}/checkins`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        weightKg: 62.9,
        weightPhotoUrl: 'local://today',
        dietText: '今天饮食清淡健康',
        dietPhotoUrls: [],
        exercisePhotoUrls: [],
      });
    expect(checked.status).toBe(200);

    const leaderboard = await request(app)
      .get(`/api/v1/rooms/${roomId}/leaderboard`)
      .set('Authorization', `Bearer ${token}`);
    expect(leaderboard.status).toBe(200);
    const first = leaderboard.body.data.members[0];
    expect(first).not.toHaveProperty('initialWeightKg');
    expect(first).not.toHaveProperty('currentWeightKg');
    expect(first).toHaveProperty('weightLossPercent');
  });
});
