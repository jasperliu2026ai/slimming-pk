import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { authRequired } from '../middlewares/auth';
import { getSignedObjectUrl, uploadPrivateImage } from '../services/storage.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/AppError';

export const uploadRouter = Router();

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.COS_MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const accepted = allowedTypes.has(file.mimetype);
    if (accepted) callback(null, true);
    else callback(new ValidationError('仅支持 JPG、PNG 或 WebP 图片'));
  },
});

function receiveImage(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      next(
        new ValidationError(error.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : '图片上传失败'),
      );
      return;
    }
    next(error);
  });
}

const categorySchema = z.enum(['avatar', 'checkin']);

uploadRouter.use(authRequired);
uploadRouter.post(
  '/images',
  receiveImage,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('请选择要上传的图片');
    const parsed = categorySchema.safeParse(req.body.category);
    if (!parsed.success) throw new ValidationError('图片分类无效');
    const data = await uploadPrivateImage({
      userId: req.userId!,
      category: parsed.data,
      contentType: req.file.mimetype,
      body: req.file.buffer,
    });
    res.status(201).json({ code: 0, message: 'ok', data });
  }),
);

uploadRouter.get(
  '/signed-url',
  asyncHandler(async (req, res) => {
    const parsed = z.string().min(1).safeParse(req.query.key);
    if (!parsed.success) throw new ValidationError('缺少照片对象 Key');
    const objectKey = parsed.data;
    const url = await getSignedObjectUrl(objectKey, req.userId!);
    res.json({ code: 0, message: 'ok', data: { objectKey, url } });
  }),
);
