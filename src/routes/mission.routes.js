import { Router } from 'express';
import { z } from 'zod';
import {
  ASSIGN_TO,
  MANAGEMENT_ROLES,
  MAX_LEVEL,
  MISSION_STATUSES,
  PLATFORMS,
  RECURRENCES,
  URGENCIES,
} from '../constants.js';
import { missionController } from '../controllers/mission.controller.js';
import { authenticate, authorize, requireSmm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { objectId, optionalUrl } from '../utils/http.js';

// No .default() here: these field sets are reused with .partial() for PATCH,
// and Mongoose model defaults fill anything left out on create.
const commonFields = {
  title: z.string().trim().min(1).max(200),
  productId: objectId.nullable(),
  type: z.string().trim().min(1).max(60),
  platform: z.enum(PLATFORMS),
  assignTo: z.enum(ASSIGN_TO),
  assignedSmmIds: z.array(objectId).max(500),
  minLevel: z.coerce.number().int().min(1).max(MAX_LEVEL),
  instructions: z.string().trim().max(5000),
  link: optionalUrl,
  reward: z.coerce.number().min(0).max(100_000),
  xpReward: z.coerce.number().int().min(0).max(10_000),
  targetCompletions: z.coerce.number().int().min(1).max(100_000),
  startsAt: z.coerce.date(),
};

const missionFields = {
  ...commonFields,
  recurrence: z.enum(RECURRENCES),
  deadline: z.coerce.date().nullable(),
};

const rapidFields = {
  ...commonFields,
  urgency: z.enum(URGENCIES),
  timeLimitHours: z.coerce.number().int().min(1).max(72),
  requiredIds: z.coerce.number().int().min(1).max(50),
};

const createSchema = (fields) =>
  z.object(fields).partial().required({ title: true }).extend({ brandId: objectId.optional() });
const updateSchema = (fields) =>
  z.object(fields).partial().extend({ status: z.enum(MISSION_STATUSES).optional() });

const startSchema = z.object({ accountIds: z.array(objectId).min(1).max(50) });

export function missionRouter(isRapid) {
  const ctrl = missionController(isRapid);
  const fields = isRapid ? rapidFields : missionFields;
  const router = Router();

  router.use(authenticate);
  router.get('/', ctrl.list);
  router.post('/', authorize(...MANAGEMENT_ROLES), validate(createSchema(fields)), ctrl.create);
  router.get('/:id', ctrl.get);
  router.patch('/:id', authorize(...MANAGEMENT_ROLES), validate(updateSchema(fields)), ctrl.update);
  router.delete('/:id', authorize(...MANAGEMENT_ROLES), ctrl.archive);
  // Missions are "started" with one ID; rapid tasks are "accepted" with requiredIds IDs.
  router.post(isRapid ? '/:id/accept' : '/:id/start', requireSmm, validate(startSchema), ctrl.start);

  return router;
}
