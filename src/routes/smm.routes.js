import { Router } from 'express';
import { z } from 'zod';
import { DIVISIONS, MANAGEMENT_ROLES, STAFF_ROLES } from '../constants.js';
import * as ctrl from '../controllers/smm.controller.js';
import { authenticate, authorize, requireSmm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emailSchema, objectId, passwordSchema } from '../utils/http.js';

const router = Router();

const differentDivisions = [
  (d) => !d.nidDivision || !d.assignedWorkingDivision || d.nidDivision !== d.assignedWorkingDivision,
  { message: 'Working division must be different from the NID division', path: ['assignedWorkingDivision'] },
];

const inviteSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    phone: z.string().trim().max(30).optional(),
    brandId: objectId.optional(),
    designation: z.string().trim().max(80).optional(),
    nidDivision: z.enum(DIVISIONS),
    assignedWorkingDivision: z.enum(DIVISIONS).optional(),
    productIds: z.array(objectId).max(50).optional(),
  })
  .refine(...differentDivisions);

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30),
    designation: z.string().trim().max(80),
    nidDivision: z.enum(DIVISIONS),
    assignedWorkingDivision: z.enum(DIVISIONS),
    status: z.enum(['Active', 'Suspended']),
  })
  .partial()
  .refine(...differentDivisions);

router.use(authenticate);

// Current SMM
router.get('/me', requireSmm, ctrl.me);
router.get('/me/career', requireSmm, ctrl.career);
router.post('/me/job-holder/claim', requireSmm, ctrl.claimJobHolderBonus);

// Workforce management
router.get('/', authorize(...STAFF_ROLES), ctrl.list);
router.post('/', authorize(...MANAGEMENT_ROLES), validate(inviteSchema), ctrl.create);
router.get('/:id', authorize(...STAFF_ROLES), ctrl.get);
router.patch('/:id', authorize(...MANAGEMENT_ROLES), validate(updateSchema), ctrl.update);
router.put(
  '/:id/products',
  authorize(...MANAGEMENT_ROLES),
  validate(z.object({ productIds: z.array(objectId).max(50) })),
  ctrl.setProducts,
);

export default router;
