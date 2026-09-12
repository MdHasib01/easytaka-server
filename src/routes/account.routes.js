import { Router } from 'express';
import { z } from 'zod';
import { MANAGEMENT_ROLES, PERSONA_TEXT_FIELDS, PLATFORMS, STAFF_ROLES } from '../constants.js';
import * as ctrl from '../controllers/account.controller.js';
import { authenticate, authorize, requireSmm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emailSchema, httpUrl, optionalUrl, reviewSchema } from '../utils/http.js';

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  platform: z.enum(PLATFORMS).optional(),
  profileUrl: optionalUrl,
  password: z.string().min(1).max(200).optional(),
  twoFactorEnabled: z.boolean().optional(),
  twoFactorMethod: z.string().trim().max(60).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  platform: z.enum(PLATFORMS).optional(),
  profileUrl: optionalUrl,
  status: z.enum(['Locked', 'Unlocked']).optional(),
});

const personaSchema = z.object({
  ...Object.fromEntries(PERSONA_TEXT_FIELDS.map((f) => [f, z.string().trim().max(1000).optional()])),
  avatar: optionalUrl,
  coverPhoto: optionalUrl,
});

const noteFields = {
  type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(4000),
  product: z.string().trim().max(160),
  relatedMission: z.string().trim().max(160),
  date: z.coerce.date(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  isImportant: z.boolean(),
  isPinned: z.boolean(),
  commentContext: z.object({
    originalComment: z.string().trim().max(2000).optional(),
    context: z.string().trim().max(500).optional(),
    tone: z.string().trim().max(60).optional(),
  }),
};
const noteCreateSchema = z.object(noteFields).partial().required({ title: true, content: true });
const noteUpdateSchema = z.object(noteFields).partial();

const contentSchema = z.object({
  type: z.string().trim().min(1).max(60).optional(),
  title: z.string().trim().min(1).max(200),
  date: z.coerce.date().optional(),
  url: optionalUrl,
  screenshot: optionalUrl,
  note: z.string().trim().max(2000).optional(),
  relatedProduct: z.string().trim().max(160).optional(),
});

const credentialsSchema = z.object({
  password: z.string().min(1).max(200).optional(),
  twoFactorEnabled: z.boolean().optional(),
  twoFactorMethod: z.string().trim().max(60).optional(),
});

const stageProofSchema = z.object({
  checklistConfirmed: z.boolean().optional(),
  profileUrl: optionalUrl,
  notes: z.string().trim().max(2000).optional(),
  screenshots: z.array(httpUrl).max(10).optional(),
  relatedProduct: z.string().trim().max(160).optional(),
});

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', requireSmm, validate(createSchema), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', validate(updateSchema), ctrl.update);
router.delete('/:id', authorize(...MANAGEMENT_ROLES), ctrl.remove);

router.put('/:id/persona', requireSmm, validate(personaSchema), ctrl.updatePersona);

router.post('/:id/notes', requireSmm, validate(noteCreateSchema), ctrl.addNote);
router.patch('/:id/notes/:noteId', requireSmm, validate(noteUpdateSchema), ctrl.updateNote);
router.delete('/:id/notes/:noteId', requireSmm, ctrl.deleteNote);

router.post('/:id/content', requireSmm, validate(contentSchema), ctrl.addContent);
router.delete('/:id/content/:entryId', requireSmm, ctrl.deleteContent);

router.put('/:id/credentials', requireSmm, validate(credentialsSchema), ctrl.setCredentials);
router.post('/:id/credentials/reveal', ctrl.revealCredentials);

router.post('/:id/stages/:stageId/submit', requireSmm, validate(stageProofSchema), ctrl.submitStage);
router.post('/:id/stages/:stageId/review', authorize(...STAFF_ROLES), validate(reviewSchema), ctrl.reviewStage);

export default router;
