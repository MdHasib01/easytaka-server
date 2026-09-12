import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DIVISIONS } from '../constants.js';
import * as ctrl from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { nidUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { emailSchema, objectId, optionalUrl, passwordSchema } from '../utils/http.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    phone: z.string().trim().max(30).optional(),
    brandId: objectId,
    nidNumber: z
      .string()
      .trim()
      .regex(/^(\d{10}|\d{13}|\d{17})$/, 'NID number must be 10, 13 or 17 digits'),
    nidDivision: z.enum(DIVISIONS),
    // Multipart forms send an empty string for an unselected option.
    assignedWorkingDivision: z.preprocess((v) => (v === '' ? undefined : v), z.enum(DIVISIONS).optional()),
  })
  .refine((d) => d.nidDivision !== d.assignedWorkingDivision, {
    message: 'Working division must be different from the NID division',
    path: ['assignedWorkingDivision'],
  });

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  avatar: optionalUrl,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

// Multipart: text fields plus `nidFront` and `nidBack` images.
router.post('/register', authLimiter, nidUpload, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.post('/impersonate', authenticate, validate(z.object({ brandId: objectId })), ctrl.impersonate);
router.patch('/me', authenticate, validate(updateMeSchema), ctrl.updateMe);
router.post('/change-password', authenticate, authLimiter, validate(changePasswordSchema), ctrl.changePassword);

export default router;
