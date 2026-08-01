import { env } from '../config/env';
import { logger } from '../config/logger';
import { ServiceUnavailableError, ValidationError } from '../utils/AppError';

type WechatApiResult = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
  result?: { suggest?: 'pass' | 'review' | 'risky'; label?: number };
};

let accessToken = '';
let accessTokenExpiresAt = 0;

function securityEnabled() {
  return Boolean(env.WECHAT_APPID && env.WECHAT_APPSECRET);
}

function requireSecurityConfig() {
  if (securityEnabled()) return true;
  if (env.NODE_ENV === 'production') {
    throw new ServiceUnavailableError('微信内容安全服务尚未配置');
  }
  return false;
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: env.WECHAT_APPID,
      secret: env.WECHAT_APPSECRET,
      force_refresh: false,
    }),
  });
  const result = (await response.json()) as WechatApiResult;
  if (!response.ok || !result.access_token) {
    logger.error({ errcode: result.errcode, errmsg: result.errmsg }, 'wechat token request failed');
    throw new ServiceUnavailableError('微信内容安全服务暂时不可用');
  }
  accessToken = result.access_token;
  accessTokenExpiresAt = Date.now() + Math.max(60, (result.expires_in ?? 7200) - 300) * 1000;
  return accessToken;
}

export async function checkWechatText(content: string, openid: string) {
  if (!requireSecurityConfig()) return;
  const token = await getAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, version: 2, scene: 1, openid }),
    },
  );
  const result = (await response.json()) as WechatApiResult;
  if (result.errcode === 87014 || result.result?.suggest === 'risky') {
    throw new ValidationError('昵称内容未通过安全检测，请使用正常的微信昵称');
  }
  if (!response.ok || result.errcode !== 0 || result.result?.suggest !== 'pass') {
    logger.warn({ errcode: result.errcode, errmsg: result.errmsg }, 'wechat text check failed');
    throw new ServiceUnavailableError('昵称安全检测暂时不可用，请稍后再试');
  }
}

export async function checkWechatImage(body: Buffer, contentType: string) {
  if (!requireSecurityConfig()) return;
  const token = await getAccessToken();
  const form = new FormData();
  form.append('media', new Blob([body], { type: contentType }), 'image');
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', body: form },
  );
  const result = (await response.json()) as WechatApiResult;
  if (result.errcode === 87014) {
    throw new ValidationError('图片未通过安全检测，请使用正常的微信头像或打卡照片');
  }
  if (!response.ok || result.errcode !== 0) {
    logger.warn({ errcode: result.errcode, errmsg: result.errmsg }, 'wechat image check failed');
    throw new ServiceUnavailableError('图片安全检测暂时不可用，请稍后再试');
  }
}
