import { Router } from 'express';
import { z } from 'zod';
import { STAFF_ROLES } from '../constants.js';
import * as ctrl from '../controllers/submission.controller.js';
import { authenticate, authorize, requireSmm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { httpUrl, optionalUrl, reviewSchema } from '../utils/http.js';

const router = Router();

const proofSchema = z.object({
  url: optionalUrl,
  screenshots: z.array(httpUrl).max(10).optional(),
  notes: z.string().trim().max(2000).optional(),
});

router.use(authenticate);
router.get('/mine', requireSmm, ctrl.mine);
router.get('/:id', ctrl.get);
router.post('/:id/submit', requireSmm, validate(proofSchema), ctrl.submit);
router.post('/:id/review', authorize(...STAFF_ROLES), validate(reviewSchema), ctrl.review);

export default router;
