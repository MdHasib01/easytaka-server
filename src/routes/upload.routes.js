import { Router } from 'express';
import * as ctrl from '../controllers/upload.controller.js';
import { authenticate } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';

const router = Router();

router.post('/', authenticate, imageUpload.array('files', 5), ctrl.upload);

export default router;
