import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../constants.js';
import * as ctrl from '../controllers/demo.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId } from '../utils/http.js';

const router = Router();

router.use(authenticate);
router.post('/reset', authorize(ROLES.ADMIN), ctrl.reset);
router.post(
  '/approved-ids',
  validate(z.object({ count: z.coerce.number().int().min(0).max(1000), smmId: objectId.optional() })),
  ctrl.setApprovedIds,
);
router.post(
  '/xp',
  validate(z.object({ amount: z.coerce.number().int().min(1).max(100_000), smmId: objectId.optional() })),
  ctrl.grantXp,
);

export default router;
