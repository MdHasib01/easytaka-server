import { ROLES } from '../constants.js';
import { Brand, Smm, User } from '../models/index.js';
import { brandOverview } from '../services/stats.service.js';
import { runWeeklyPayroll } from '../services/wallet.service.js';
import { assertBrandAccess, isPlatformAdmin } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';

async function loadBrand(req) {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw ApiError.notFound('Brand not found');
  assertBrandAccess(req, brand._id);
  return brand;
}

/** Fills in missing checklist item ids (e.g. 'stg2-c3'). */
const normaliseStages = (stages) =>
  stages.map((s) => ({
    ...s,
    checklist: (s.checklist ?? []).map((c, i) => ({ id: c.id || `${s.id}-c${i + 1}`, label: c.label })),
  }));

/** Unauthenticated list for the registration form. */
export async function listPublic(_req, res) {
  res.json(
    await Brand.find({ status: 'Active' })
      .select('name logo industry primaryPlatform emailGuideline')
      .sort({ name: 1 }),
  );
}

/** Brand-scoped users get their own brand; platform admins get every brand with card stats. */
export async function list(req, res) {
  if (!isPlatformAdmin(req.user)) {
    res.json(await Brand.find({ _id: req.user.brand }).sort({ name: 1 }));
    return;
  }

  const [brands, smmStats, staffStats] = await Promise.all([
    Brand.find().sort({ name: 1 }),
    Smm.aggregate([
      {
        $group: {
          _id: '$brand',
          smmCount: { $sum: 1 },
          pendingVerifications: { $sum: { $cond: [{ $eq: ['$verification.status', 'Pending'] }, 1, 0] } },
        },
      },
    ]),
    User.aggregate([
      { $match: { role: { $in: [ROLES.MANAGER, ROLES.REVIEWER] }, brand: { $ne: null } } },
      { $group: { _id: '$brand', staffCount: { $sum: 1 } } },
    ]),
  ]);

  const smmByBrand = new Map(smmStats.map((s) => [String(s._id), s]));
  const staffByBrand = new Map(staffStats.map((s) => [String(s._id), s]));
  res.json(
    brands.map((b) => ({
      ...b.toJSON(),
      smmCount: smmByBrand.get(String(b._id))?.smmCount ?? 0,
      pendingVerifications: smmByBrand.get(String(b._id))?.pendingVerifications ?? 0,
      staffCount: staffByBrand.get(String(b._id))?.staffCount ?? 0,
    })),
  );
}

export async function get(req, res) {
  res.json(await loadBrand(req));
}

export async function create(req, res) {
  if (!isPlatformAdmin(req.user)) throw ApiError.forbidden('Only platform admins can create brands');
  const { enrichmentStages, ...fields } = req.body;
  const brand = await Brand.create({
    ...fields,
    ...(enrichmentStages && { enrichmentStages: normaliseStages(enrichmentStages) }),
  });
  res.status(201).json(brand);
}

export async function update(req, res) {
  const brand = await loadBrand(req);
  const { settings, ...fields } = req.body;
  brand.set(fields);
  for (const [key, value] of Object.entries(settings ?? {})) {
    brand.set(`settings.${key}`, value);
  }
  await brand.save();
  res.json(brand);
}

/** Replaces the enrichment pipeline. Existing accounts keep the stages they were created with. */
export async function updateStages(req, res) {
  const brand = await loadBrand(req);
  brand.enrichmentStages = normaliseStages(req.body.stages);
  await brand.save();
  res.json(brand.enrichmentStages);
}

export async function overview(req, res) {
  res.json(await brandOverview(await loadBrand(req)));
}

export async function runPayroll(req, res) {
  res.json(await runWeeklyPayroll(await loadBrand(req)));
}
