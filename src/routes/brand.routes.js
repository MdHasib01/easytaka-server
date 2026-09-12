import { Router } from 'express';
import { z } from 'zod';
import { MANAGEMENT_ROLES, PLATFORMS, REQUIREMENT_TYPES, ROLES, STAFF_ROLES } from '../constants.js';
import * as ctrl from '../controllers/brand.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const settingsSchema = z
  .object({
    productsPerSmm: z.coerce.number().int().min(1).max(50),
    jobHolderThreshold: z.coerce.number().int().min(1).max(1000),
    jobHolderBonusCash: z.coerce.number().min(0).max(1_000_000),
    jobHolderBonusXp: z.coerce.number().int().min(0).max(100_000),
    fullEnrichmentReward: z.coerce.number().min(0).max(1_000_000),
    weeklyBaseSalary: z.coerce.number().min(0).max(1_000_000),
    minWithdrawal: z.coerce.number().min(0).max(1_000_000),
  })
  .partial();

const stageSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Stage id may only contain letters, numbers, "-" and "_"'),
  name: z.string().trim().min(1).max(120),
  weight: z.coerce.number().int().min(0).max(100),
  required: z.boolean().optional(),
  xpReward: z.coerce.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
  checklist: z
    .array(z.object({ id: z.string().trim().max(60).optional(), label: z.string().trim().min(1).max(300) }))
    .max(20)
    .optional(),
  requirement: z
    .object({ type: z.enum(REQUIREMENT_TYPES), min: z.coerce.number().int().min(0).max(1000).default(0) })
    .optional(),
});

const stageListSchema = z
  .array(stageSchema)
  .min(1)
  .max(20)
  .refine(
    (stages) => stages.filter((s) => s.active !== false).reduce((sum, s) => sum + s.weight, 0) === 100,
    'Active enrichment stage weights must total 100',
  )
  .refine((stages) => new Set(stages.map((s) => s.id)).size === stages.length, 'Stage ids must be unique');

const brandFields = {
  name: z.string().trim().min(1).max(120),
  logo: z.string().trim().max(2000),
  status: z.enum(['Active', 'Inactive']),
  industry: z.string().trim().max(120),
  primaryPlatform: z.enum(PLATFORMS),
  emailGuideline: z.string().trim().max(200),
  settings: settingsSchema,
};

const createSchema = z
  .object(brandFields)
  .partial()
  .required({ name: true })
  .extend({ enrichmentStages: stageListSchema.optional() });
const updateSchema = z.object(brandFields).partial();

router.get('/public', ctrl.listPublic);

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', authorize(ROLES.ADMIN), validate(createSchema), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', authorize(...MANAGEMENT_ROLES), validate(updateSchema), ctrl.update);
router.put(
  '/:id/enrichment-stages',
  authorize(...MANAGEMENT_ROLES),
  validate(z.object({ stages: stageListSchema })),
  ctrl.updateStages,
);
router.get('/:id/overview', authorize(...STAFF_ROLES), ctrl.overview);
router.post('/:id/payroll/run', authorize(...MANAGEMENT_ROLES), ctrl.runPayroll);
router.delete('/:id', authorize(ROLES.ADMIN), ctrl.remove);

export default router;
