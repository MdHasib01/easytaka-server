import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/message.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId } from '../utils/http.js';

const router = Router();

const createSchema = z.object({
  participantId: objectId,
  topic: z.string().trim().max(160).optional(),
  message: z.string().trim().min(1).max(4000),
  relatedAccountId: objectId.optional(),
});
const sendSchema = z.object({ content: z.string().trim().min(1).max(4000) });

router.use(authenticate);
router.get('/contacts', ctrl.contacts);
router.get('/', ctrl.list);
router.post('/', validate(createSchema), ctrl.create);
router.get('/:id/messages', ctrl.messages);
router.post('/:id/messages', validate(sendSchema), ctrl.send);
router.post('/:id/read', ctrl.read);

export default router;
