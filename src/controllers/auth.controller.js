import { destroy, uploadBuffer } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants.js';
import { signToken } from '../middleware/auth.js';
import { Brand, Smm, User } from '../models/index.js';
import { createSmmWithUser } from '../services/workforce.service.js';
import { isPlatformAdmin } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';

const BRAND_FIELDS = 'name logo status industry primaryPlatform';

async function loadSmmProfile(user) {
  if (user.role !== ROLES.SMM) return null;
  return Smm.findOne({ user: user._id }).select('-nid').populate('brand', 'name logo');
}

/** The brand the user works in: their own, or the one a platform admin is acting as. */
async function loadBrand(user) {
  return user.brand ? Brand.findById(user.brand).select(BRAND_FIELDS) : null;
}

async function profile(req, user = req.user) {
  const [smm, brand] = await Promise.all([loadSmmProfile(user), loadBrand(user)]);
  return { user, smm, brand, impersonating: Boolean(req.impersonating) };
}

async function session(req, user) {
  return { token: signToken(user), ...(await profile(req, user)) };
}

const uploadNid = (file) =>
  uploadBuffer(file.buffer, { folder: 'easytaka/nid', type: 'authenticated', resource_type: 'image' });

const discardNid = (images) =>
  Promise.allSettled(images.map((img) => destroy(img.public_id, { type: 'authenticated' })));

/** SMM self-signup. The NID photos are stored privately and the SMM waits for admin verification. */
export async function register(req, res) {
  if (!env.ALLOW_PUBLIC_REGISTER) throw ApiError.forbidden('Public registration is disabled');
  if (!env.cloudinaryEnabled) throw new ApiError(503, 'NID uploads are not configured on this server');

  const front = req.files?.nidFront?.[0];
  const back = req.files?.nidBack?.[0];
  if (!front || !back) throw ApiError.badRequest('Upload photos of both the front and back of your NID');

  const { brandId, nidNumber, ...fields } = req.body;
  const brand = await Brand.findOne({ _id: brandId, status: 'Active' });
  if (!brand) throw ApiError.badRequest('The selected brand is not available');
  // Checked before uploading so a duplicate signup doesn't leave orphaned NID images.
  if (await User.exists({ email: fields.email })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const settled = await Promise.allSettled([uploadNid(front), uploadNid(back)]);
  const images = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = settled.find((r) => r.status === 'rejected');
  if (failed) {
    await discardNid(images);
    throw new ApiError(502, `NID upload failed: ${failed.reason?.message ?? 'unknown error'}`);
  }

  const [frontImg, backImg] = images;
  try {
    const { user } = await createSmmWithUser({
      ...fields,
      brandId: brand._id,
      nid: {
        number: nidNumber,
        front: { publicId: frontImg.public_id, format: frontImg.format },
        back: { publicId: backImg.public_id, format: backImg.format },
      },
      verification: { status: 'Pending' },
    });
    res.status(201).json(await session(req, user));
  } catch (err) {
    await discardNid(images);
    throw err;
  }
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.status !== 'Active') throw ApiError.forbidden('This account is suspended');

  user.lastLoginAt = new Date();
  await user.save();
  res.json(await session(req, user));
}

export async function me(req, res) {
  res.json(await profile(req));
}

/** A platform admin logs in as a brand's admin. The client keeps the admin token to switch back. */
export async function impersonate(req, res) {
  if (req.impersonating || !isPlatformAdmin(req.user)) {
    throw ApiError.forbidden('Only platform admins can log in as a brand');
  }
  const brand = await Brand.findById(req.body.brandId).select(BRAND_FIELDS);
  if (!brand) throw ApiError.notFound('Brand not found');

  const token = signToken(req.user, { actAsBrand: String(brand._id) }, { expiresIn: '8h' });
  res.json({ token, user: req.user, smm: null, brand, impersonating: true });
}

function assertNotImpersonating(req) {
  if (req.impersonating) {
    throw ApiError.forbidden('Switch back to your admin account to change your profile');
  }
}

export async function updateMe(req, res) {
  assertNotImpersonating(req);
  req.user.set(req.body);
  await req.user.save();
  res.json({ user: req.user });
}

export async function changePassword(req, res) {
  assertNotImpersonating(req);
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = req.body.newPassword;
  await user.save();
  res.json({ token: signToken(user) });
}
