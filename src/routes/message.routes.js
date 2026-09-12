import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../constants.js';
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
const groupSchema = z
  .object({
    name: z.string().trim().min(1, 'Group name is required').max(80),
    participantIds: z.array(objectId).max(ctrl.MAX_GROUP_MEMBERS).default([]),
    roles: z.array(z.enum(Object.values(ROLES))).max(4).default([]),
    message: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.participantIds.length || v.roles.length, {
    message: 'Select at least one member or role',
    path: ['participantIds'],
  });
const sendSchema = z.object({ content: z.string().trim().min(1).max(4000) });

router.use(authenticate);
router.get('/contacts', ctrl.contacts);
router.get('/', ctrl.list);
router.post('/', validate(createSchema), ctrl.create);
router.post('/groups', validate(groupSchema), ctrl.createGroup);
router.get('/:id/messages', ctrl.messages);
router.post('/:id/messages', validate(sendSchema), ctrl.send);
router.post('/:id/read', ctrl.read);

export default router;
