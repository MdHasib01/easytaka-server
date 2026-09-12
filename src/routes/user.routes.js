import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../constants.js';
import * as ctrl from '../controllers/user.controller.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emailSchema, objectId, passwordSchema } from '../utils/http.js';

const router = Router();

// SMMs are created by self-registration or the workforce "Invite SMM" flow, not here.
const createSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    phone: z.string().trim().max(30).optional(),
    role: z.enum([ROLES.ADMIN, ROLES.MANAGER, ROLES.REVIEWER]),
    brandId: objectId.optional(),
  })
  .refine((d) => d.role === ROLES.ADMIN || d.brandId, {
    message: 'Choose the brand this user belongs to',
    path: ['brandId'],
  });

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30),
    status: z.enum(['Active', 'Suspended']),
  })
  .partial();

const verificationSchema = z
  .object({
    action: z.enum(['Approve', 'Reject']),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.action === 'Approve' || d.note, {
    message: 'Give a reason for rejecting',
    path: ['note'],
  });

router.use(authenticate, requirePlatformAdmin);
router.get('/', ctrl.list);
router.post('/', validate(createSchema), ctrl.create);
router.patch('/:id', validate(updateSchema), ctrl.update);
router.get('/:id/nid', ctrl.nid);
router.post('/:id/verification', validate(verificationSchema), ctrl.verify);

export default router;
