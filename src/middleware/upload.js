import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter(_req, file, cb) {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}. Use JPEG, PNG, WebP or GIF.`));
  },
});

const NID_ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** Front and back photos of the national ID card, sent with SMM registration. */
export const nidUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter(_req, file, cb) {
    if (NID_ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}. Use JPEG, PNG or WebP.`));
  },
}).fields([
  { name: 'nidFront', maxCount: 1 },
  { name: 'nidBack', maxCount: 1 },
]);
