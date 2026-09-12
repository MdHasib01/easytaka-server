import { Router } from 'express';
import { z } from 'zod';
import { MANAGEMENT_ROLES } from '../constants.js';
import * as ctrl from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId, optionalUrl } from '../utils/http.js';

const router = Router();

const productFields = {
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(60),
  type: z.string().trim().max(60),
  shortDescription: z.string().trim().max(500),
  image: optionalUrl,
  status: z.enum(['Active', 'Inactive']),
};

const createSchema = z
  .object(productFields)
  .partial()
  .required({ name: true, sku: true })
  .extend({ brandId: objectId.optional() });
const updateSchema = z.object(productFields).partial();

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', authorize(...MANAGEMENT_ROLES), validate(createSchema), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', authorize(...MANAGEMENT_ROLES), validate(updateSchema), ctrl.update);
router.delete('/:id', authorize(...MANAGEMENT_ROLES), ctrl.remove);
router.post('/:id/assign', authorize(...MANAGEMENT_ROLES), validate(z.object({ smmId: objectId })), ctrl.assign);
router.delete('/:id/assign/:smmId', authorize(...MANAGEMENT_ROLES), ctrl.unassign);

export default router;
