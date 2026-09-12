import { signedUrl, uploadBuffer } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { DIVISIONS } from '../constants.js';
import { Brand, Mission, Smm, SocialAccount, User } from '../models/index.js';
import {
  careerSummary,
  claimJobHolderBonus as claimBonus,
} from '../services/progression.service.js';
import { weeklyEarnings } from '../services/wallet.service.js';
import { createSmmWithUser, setSmmProducts } from '../services/workforce.service.js';
import { assertBrandAccess, brandFilter, brandForWrite } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, queryEnum } from '../utils/http.js';

const USER_FIELDS = 'name email phone avatar status lastLoginAt';

async function loadSmm(req) {
  const smm = await Smm.findById(req.params.id)
    .populate('user', USER_FIELDS)
    .populate('assignedProductIds', 'name sku type status');
  if (!smm) throw ApiError.notFound('SMM not found');
  assertBrandAccess(req, smm.brand);
  return smm;
}

/** Workforce directory. */
export async function list(req, res) {
  const filter = { ...brandFilter(req) };
  const division = queryEnum(req.query.division, DIVISIONS, 'division');
  if (division) filter.assignedWorkingDivision = division;
  const status = queryEnum(req.query.status, ['Active', 'Suspended'], 'status');
  if (status) filter.status = status;
  if (req.query.q) {
    const users = await User.find({
      role: 'SMM',
      name: { $regex: escapeRegex(req.query.q), $options: 'i' },
    }).select('_id');
    filter.user = { $in: users.map((u) => u._id) };
  }

  const sortKey = queryEnum(req.query.sort, ['quality', 'level', 'progress', 'newest'], 'sort') ?? 'quality';
  const sort = {
    quality: { qualityScore: -1 },
    level: { lifetimeXp: -1 },
    progress: { approvedEnrichedIds: -1 },
    newest: { createdAt: -1 },
  }[sortKey];

  const smms = await Smm.find(filter)
    .populate('user', USER_FIELDS)
    .populate('assignedProductIds', 'name sku')
    .sort(sort);
  res.json(smms);
}

/** "Invite SMM": creates the login and the SMM profile. */
export async function create(req, res) {
  const { brandId, productIds, ...fields } = req.body;
  const brand = brandForWrite(req, brandId);
  if (!(await Brand.exists({ _id: brand }))) throw ApiError.notFound('Brand not found');

  const { smm } = await createSmmWithUser({ ...fields, brandId: brand });
  if (productIds?.length) await setSmmProducts(smm, productIds);
  await smm.populate([
    { path: 'user', select: USER_FIELDS },
    { path: 'assignedProductIds', select: 'name sku' },
  ]);
  res.status(201).json(smm);
}

export async function get(req, res) {
  const smm = await loadSmm(req);
  res.json({ ...smm.toJSON(), career: careerSummary(smm) });
}

export async function update(req, res) {
  const smm = await loadSmm(req);
  const { name, phone, avatar, ...fields } = req.body;
  smm.set(fields);
  await smm.save();
  if (name !== undefined || phone !== undefined || avatar !== undefined) {
    await User.updateOne(
      { _id: smm.user._id },
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(avatar !== undefined && { avatar }),
        },
      },
    );
    await smm.populate('user', USER_FIELDS);
  }
  res.json(smm);
}

export async function setProducts(req, res) {
  const smm = await loadSmm(req);
  await setSmmProducts(smm, req.body.productIds);
  await smm.populate('assignedProductIds', 'name sku type status');
  res.json(smm);
}

/** Current SMM's profile plus everything the SMM home screen needs. */
export async function me(req, res) {
  const smm = await Smm.findById(req.smm._id)
    .populate('user', USER_FIELDS)
    .populate('brand', 'name logo settings emailGuideline')
    .populate('assignedProductIds', 'name sku type');
  const brandId = smm.brand._id;
  const now = new Date();

  const [weekly, needsAttention, activeMissions, activeRapidTasks] = await Promise.all([
    weeklyEarnings(smm._id),
    SocialAccount.countDocuments({
      smm: smm._id,
      $or: [
        { approvalStatus: { $in: ['Under Review', 'Revision Required'] } },
        { enrichmentPercent: { $lt: 100 } },
      ],
    }),
    smm.jobHolderUnlocked
      ? Mission.countDocuments({ brand: brandId, isRapid: false, status: 'Active' })
      : 0,
    smm.jobHolderUnlocked
      ? Mission.countDocuments({ brand: brandId, isRapid: true, status: 'Active', deadline: { $gt: now } })
      : 0,
  ]);

  const threshold = smm.brand.settings.jobHolderThreshold;
  res.json({
    ...smm.toJSON(),
    weeklyEarnings: weekly,
    jobHolder: {
      threshold,
      approvedIds: smm.approvedEnrichedIds,
      progress: Math.min(100, Math.round((smm.approvedEnrichedIds / threshold) * 100)),
      remaining: Math.max(0, threshold - smm.approvedEnrichedIds),
      canClaim: !smm.jobHolderBonusClaimed && smm.approvedEnrichedIds >= threshold,
      unlocked: smm.jobHolderUnlocked,
      claimed: smm.jobHolderBonusClaimed,
    },
    summary: { needsAttention, activeMissions, activeRapidTasks },
  });
}

export async function career(req, res) {
  res.json(careerSummary(req.smm));
}

export async function claimJobHolderBonus(req, res) {
  res.json(await claimBonus(req.smm._id));
}

/** Returns the current SMM's own NID details and verification status. */
export async function myNid(req, res) {
  const smm = await Smm.findById(req.smm._id).populate('brand', 'name logo');
  const image = (img) =>
    img?.publicId && env.cloudinaryEnabled ? signedUrl(img.publicId, img.format) : null;

  const hasNid = Boolean(smm.nid?.front?.publicId || (smm.nid?.front && smm.nid?.back));

  res.json({
    hasNid,
    number: smm.nid?.number ?? null,
    nidDivision: smm.nidDivision,
    assignedWorkingDivision: smm.assignedWorkingDivision,
    frontUrl: image(smm.nid?.front),
    backUrl: image(smm.nid?.back),
    verification: smm.verification,
    brand: smm.brand,
  });
}

/** Allows an SMM to upload NID once if not already uploaded. Strictly non-editable afterwards. */
export async function uploadMyNid(req, res) {
  const smm = await Smm.findById(req.smm._id);
  if (!smm) throw ApiError.notFound('SMM profile not found');

  if (smm.nid?.front?.publicId || (smm.nid?.number && smm.verification?.status === 'Verified')) {
    throw ApiError.forbidden('Your National ID has already been submitted and cannot be edited');
  }

  if (!env.cloudinaryEnabled) {
    throw new ApiError(503, 'NID uploads are not configured on this server');
  }

  const front = req.files?.nidFront?.[0];
  const back = req.files?.nidBack?.[0];
  if (!front || !back) {
    throw ApiError.badRequest('Upload photos of both the front and back of your NID');
  }

  const { nidNumber, nidDivision } = req.body;
  if (!nidDivision || !DIVISIONS.includes(nidDivision)) {
    throw ApiError.badRequest('Please select a valid NID division');
  }
  if (smm.assignedWorkingDivision && smm.assignedWorkingDivision === nidDivision) {
    throw ApiError.badRequest('Working division must be different from your NID division');
  }

  const uploadNidBuffer = (file) =>
    uploadBuffer(file.buffer, { folder: 'easytaka/nid', type: 'authenticated', resource_type: 'image' });

  const [frontImg, backImg] = await Promise.all([uploadNidBuffer(front), uploadNidBuffer(back)]);

  smm.nidDivision = nidDivision;
  smm.nid = {
    number: nidNumber ? String(nidNumber).trim() : null,
    front: { publicId: frontImg.public_id, format: frontImg.format },
    back: { publicId: backImg.public_id, format: backImg.format },
  };
  smm.verification = {
    status: 'Pending',
    reviewedAt: undefined,
    reviewedBy: undefined,
    note: undefined,
  };

  await smm.save();

  const image = (img) =>
    img?.publicId && env.cloudinaryEnabled ? signedUrl(img.publicId, img.format) : null;

  res.status(201).json({
    success: true,
    message: 'National ID submitted for verification. It is now locked.',
    hasNid: true,
    number: smm.nid.number,
    nidDivision: smm.nidDivision,
    frontUrl: image(smm.nid.front),
    backUrl: image(smm.nid.back),
    verification: smm.verification,
  });
}
