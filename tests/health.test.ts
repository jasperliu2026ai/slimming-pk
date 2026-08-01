process.env.JWT_SECRET = 'test-secret-please-change';
process.env.DATABASE_URL ||=
  'mysql://slimming_pk:slimming_pk_dev_2026@127.0.0.1:3306/slimming_pk_test';
process.env.WECHAT_APPID = '';
process.env.WECHAT_APPSECRET = '';
process.env.COS_SECRET_ID = '';
process.env.COS_SECRET_KEY = '';

import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/v1/health', () => {
  it('returns 200 ok', async () => {
    const app = createApp();
    expect(app.get('trust proxy')).toBe('loopback');
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database).toBe('ok');
  });
});
