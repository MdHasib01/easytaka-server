import { Router } from 'express';
import { z } from 'zod';
import { MANAGEMENT_ROLES } from '../constants.js';
import * as ctrl from '../controllers/reward.controller.js';
import { authenticate, authorize, requireSmm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId } from '../utils/http.js';

const router = Router();

const itemFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  cost: z.coerce.number().int().min(1).max(1_000_000),
  icon: z.string().trim().max(40),
  stock: z.coerce.number().int().min(0).nullable(),
  active: z.boolean(),
};

const createSchema = z
  .object(itemFields)
  .partial()
  .required({ title: true, cost: true })
  .extend({ brandId: objectId.nullable().optional() });
const updateSchema = z.object(itemFields).partial();
const processSchema = z.object({
  status: z.enum(['Fulfilled', 'Cancelled']),
  note: z.string().trim().max(500).optional(),
});

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', authorize(...MANAGEMENT_ROLES), validate(createSchema), ctrl.create);
router.get('/redemptions', ctrl.redemptions);
router.patch('/redemptions/:id', authorize(...MANAGEMENT_ROLES), validate(processSchema), ctrl.processRedemption);
router.patch('/:id', authorize(...MANAGEMENT_ROLES), validate(updateSchema), ctrl.update);
router.post('/:id/redeem', requireSmm, ctrl.redeem);

export default router;
