import { randomUUID } from 'crypto';
import COS from 'cos-nodejs-sdk-v5';
import { env } from '../config/env';
import { ForbiddenError, ServiceUnavailableError, ValidationError } from '../utils/AppError';

export type UploadCategory = 'avatar' | 'checkin';

const contentTypeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

let cosClient: COS | null = null;

function getCosClient() {
  if (!env.COS_SECRET_ID || !env.COS_SECRET_KEY) {
    throw new ServiceUnavailableError('腾讯云 COS 尚未配置，请先填写后端 .env');
  }
  if (!cosClient) {
    cosClient = new COS({
      SecretId: env.COS_SECRET_ID,
      SecretKey: env.COS_SECRET_KEY,
      Protocol: 'https:',
    });
  }
  return cosClient;
}

function folderFor(category: UploadCategory) {
  return category === 'avatar' ? 'Avatar' : 'checkin';
}

export function isManagedObjectKey(value: string) {
  return value.startsWith('Avatar/') || value.startsWith('checkin/');
}

export function assertOwnedObjectKey(value: string, userId: string) {
  if (!value) return;
  if (env.NODE_ENV !== 'production' && value.startsWith('local://')) return;
  if (!value.startsWith(`Avatar/${userId}/`) && !value.startsWith(`checkin/${userId}/`)) {
    throw new ForbiddenError('照片不属于当前用户');
  }
}

export async function uploadPrivateImage(input: {
  userId: string;
  category: UploadCategory;
  contentType: string;
  body: Buffer;
}) {
  const extension = contentTypeExtensions[input.contentType];
  if (!extension) throw new ValidationError('仅支持 JPG、PNG 或 WebP 图片');
  const month = new Date().toISOString().slice(0, 7);
  const objectKey = `${folderFor(input.category)}/${input.userId}/${month}/${randomUUID()}.${extension}`;
  await getCosClient().putObject({
    Bucket: env.COS_BUCKET,
    Region: env.COS_REGION,
    Key: objectKey,
    Body: input.body,
    ContentLength: input.body.length,
    ContentType: input.contentType,
    ACL: 'private',
    ServerSideEncryption: 'AES256',
    'x-cos-meta-owner-id': input.userId,
  });
  return {
    objectKey,
    previewUrl: await getSignedObjectUrl(objectKey, input.userId),
  };
}

export async function getSignedObjectUrl(objectKey: string, userId: string) {
  assertOwnedObjectKey(objectKey, userId);
  return signObjectUrl(objectKey);
}

async function signObjectUrl(objectKey: string) {
  const result = await new Promise<COS.GetObjectUrlResult>((resolve, reject) => {
    getCosClient().getObjectUrl(
      {
        Bucket: env.COS_BUCKET,
        Region: env.COS_REGION,
        Key: objectKey,
        Sign: true,
        Method: 'GET',
        Expires: env.COS_SIGNED_URL_EXPIRES,
        Protocol: 'https:',
      },
      (error, data) => (error ? reject(error) : resolve(data)),
    );
  });
  return result.Url;
}

export async function getSignedAvatarUrl(objectKey: string) {
  if (!objectKey) return '';
  if (objectKey.startsWith('https://')) return objectKey;
  if (!objectKey.startsWith('Avatar/')) return '';
  return signObjectUrl(objectKey);
}

export async function deleteManagedObjects(objectKeys: string[]) {
  const keys = [...new Set(objectKeys.filter(isManagedObjectKey))];
  if (!keys.length) return;
  const client = getCosClient();
  await Promise.all(
    keys.map((Key) => client.deleteObject({ Bucket: env.COS_BUCKET, Region: env.COS_REGION, Key })),
  );
}
