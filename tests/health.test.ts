import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/v1/health', () => {
  it('returns 200 ok', async () => {
    // 让 env 通过校验
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-please-change';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/fitpk';

    const app = createApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
