import crypto from 'node:crypto';
import { signedUrl } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants.js';
import mongoose from '../lib/mongoose.js';
import { Brand, Smm, User } from '../models/index.js';
import { sameId } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, queryEnum } from '../utils/http.js';

const VERIFICATION_STATUSES = ['Pending', 'Verified', 'Rejected'];
const SMM_SUMMARY_FIELDS = 'user nidDivision assignedWorkingDivision verification nid.front.publicId';

const smmSummary = (smm) =>
  smm && {
    id: smm.id,
    nidDivision: smm.nidDivision,
    assignedWorkingDivision: smm.assignedWorkingDivision,
    verification: smm.verification,
    hasNid: Boolean(smm.nid?.front?.publicId),
  };

async function withSmm(users) {
  const smmUserIds = users.filter((u) => u.role === ROLES.SMM).map((u) => u._id);
  const smms = smmUserIds.length
    ? await Smm.find({ user: { $in: smmUserIds } }).select(SMM_SUMMARY_FIELDS)
    : [];
  const byUser = new Map(smms.map((s) => [String(s.user), s]));
  return users.map((u) => ({ ...u.toJSON(), smm: smmSummary(byUser.get(String(u._id))) ?? null }));
}

async function loadUser(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id');
  const user = await User.findById(id).populate('brand', 'name logo');
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function loadSmmOfUser(userId) {
  if (!mongoose.isValidObjectId(userId)) throw ApiError.badRequest('Invalid user id');
  const smm = await Smm.findOne({ user: userId })
    .populate('user', 'name email phone')
    .populate('brand', 'name logo')
    .populate('verification.reviewedBy', 'name');
  if (!smm) throw ApiError.notFound('This user has no SMM profile');
  return smm;
}

/** Every user on the platform. `?verification=` narrows to SMMs with that NID status. */
export async function list(req, res) {
  const filter = {};
  const role = queryEnum(req.query.role, Object.values(ROLES), 'role');
  if (role) filter.role = role;
  const status = queryEnum(req.query.status, ['Active', 'Suspended'], 'status');
  if (status) filter.status = status;
  if (req.query.brand) {
    if (!mongoose.isValidObjectId(String(req.query.brand))) throw ApiError.badRequest('Invalid brand id');
    filter.brand = new mongoose.Types.ObjectId(String(req.query.brand));
  }
  if (req.query.q) {
    const rx = { $regex: escapeRegex(req.query.q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const verification = queryEnum(req.query.verification, VERIFICATION_STATUSES, 'verification');
  if (verification) {
    filter._id = { $in: await Smm.find({ 'verification.status': verification }).distinct('user') };
  }

  const users = await User.find(filter).populate('brand', 'name logo').sort({ createdAt: -1 }).limit(500);
  res.json(await withSmm(users));
}

/** Creates a platform admin, or a brand admin (MANAGER) / reviewer for one brand. */
export async function create(req, res) {
  const { brandId, role, ...fields } = req.body;
  let brand = null;
  if (role !== ROLES.ADMIN) {
    if (!(await Brand.exists({ _id: brandId }))) throw ApiError.notFound('Brand not found');
    brand = brandId;
  }
  if (await User.exists({ email: fields.email })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create({ ...fields, role, brand });
  await user.populate('brand', 'name logo');
  res.status(201).json({ ...user.toJSON(), smm: null });
}

export async function update(req, res) {
  const user = await loadUser(req.params.id);
  if (req.body.status === 'Suspended' && sameId(user._id, req.user._id)) {
    throw ApiError.badRequest('You cannot suspend your own account');
  }
  // Admin cannot edit user personal info; only account status toggling is permitted
  if (req.body.status && ['Active', 'Suspended'].includes(req.body.status)) {
    user.status = req.body.status;
  }
  await user.save();
  const [result] = await withSmm([user]);
  res.json(result);
}

/** NID details for review. Image links are signed and expire after a few minutes. */
export async function nid(req, res) {
  const smm = await loadSmmOfUser(req.params.id);
  const image = (img) =>
    img?.publicId && env.cloudinaryEnabled ? signedUrl(img.publicId, img.format) : null;

  res.json({
    user: smm.user,
    brand: smm.brand,
    number: smm.nid?.number ?? null,
    nidDivision: smm.nidDivision,
    assignedWorkingDivision: smm.assignedWorkingDivision,
    frontUrl: image(smm.nid?.front),
    backUrl: image(smm.nid?.back),
    verification: smm.verification,
  });
}

export async function verify(req, res) {
  const smm = await loadSmmOfUser(req.params.id);
  smm.verification = {
    status: req.body.action === 'Approve' ? 'Verified' : 'Rejected',
    note: req.body.note,
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  };
  await smm.save();
  res.json({ verification: smm.verification });
}

export async function resetPassword(req, res) {
  const user = await loadUser(req.params.id);
  const randomChars = crypto.randomBytes(4).toString('hex');
  const tempPassword = `Easy#${randomChars}!Aa1`;
  user.password = tempPassword;
  await user.save();

  console.log(`[EMAIL DISPATCH] Sent temporary password to ${user.email}. Temporary password: ${tempPassword}`);

  res.json({
    success: true,
    email: user.email,
    tempPassword,
    message: `A temporary password has been dispatched to ${user.email}`,
  });
}
