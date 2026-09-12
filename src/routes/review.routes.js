import { Router } from 'express';
import { STAFF_ROLES } from '../constants.js';
import * as ctrl from '../controllers/review.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, authorize(...STAFF_ROLES));
router.get('/summary', ctrl.summary);
router.get('/enrichment', ctrl.enrichmentQueue);
router.get('/submissions', ctrl.submissionQueue);

export default router;
