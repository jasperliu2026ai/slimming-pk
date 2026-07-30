import { env } from '../config/env';
import { ServiceUnavailableError } from '../utils/AppError';

let cachedAccessToken = '';
let accessTokenExpiresAt = 0;

async function getAccessToken() {
  if (!env.WECHAT_APPID || !env.WECHAT_APPSECRET) {
    throw new ServiceUnavailableError('微信小程序 AppID 或 AppSecret 尚未配置');
  }
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt) return cachedAccessToken;
  const query = new URLSearchParams({
    grant_type: 'client_credential',
    appid: env.WECHAT_APPID,
    secret: env.WECHAT_APPSECRET,
  });
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${query}`);
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new ServiceUnavailableError(`获取微信 access_token 失败：${body.errmsg ?? body.errcode}`);
  }
  cachedAccessToken = body.access_token;
  accessTokenExpiresAt = Date.now() + Math.max(60, (body.expires_in ?? 7200) - 300) * 1000;
  return cachedAccessToken;
}

export async function getRoomMiniProgramCode(roomId: string) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene: `r=${roomId}`,
        page: 'pages/pk-room-detail/pk-room-detail',
        check_path: false,
        env_version: env.WECHAT_MINI_PROGRAM_ENV_VERSION,
        width: 280,
      }),
    },
  );
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || contentType.includes('application/json')) {
    const body = (await response.json()) as { errcode?: number; errmsg?: string };
    throw new ServiceUnavailableError(`生成微信小程序码失败：${body.errmsg ?? body.errcode}`);
  }
  const image = Buffer.from(await response.arrayBuffer());
  return {
    imageBase64: image.toString('base64'),
    mimeType: contentType || 'image/png',
  };
}
