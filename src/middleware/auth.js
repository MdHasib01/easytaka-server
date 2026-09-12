import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ROLES } from '../constants.js';
import mongoose from '../lib/mongoose.js';
import { Brand, Smm, User } from '../models/index.js';
import { isPlatformAdmin } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';

/** `claims.actAsBrand` marks a platform admin acting as that brand's admin. */
export function signToken(user, claims = {}, { expiresIn = env.JWT_EXPIRES_IN } = {}) {
  return jwt.sign({ sub: String(user._id), role: user.role, ...claims }, env.JWT_SECRET, { expiresIn });
}

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.status !== 'Active') throw ApiError.forbidden('This account is suspended');

  if (payload.actAsBrand) {
    if (!isPlatformAdmin(user) || !mongoose.isValidObjectId(payload.actAsBrand)) {
      throw ApiError.unauthorized('This brand session is no longer valid');
    }
    if (!(await Brand.exists({ _id: payload.actAsBrand }))) {
      throw ApiError.unauthorized('This brand no longer exists');
    }
    // In-memory only: the brand-scoping helpers in utils/access.js now treat the admin as
    // that brand's admin. Handlers that save req.user must refuse while impersonating.
    user.brand = payload.actAsBrand;
    req.impersonating = true;
  }

  req.user = user;
  if (user.role === ROLES.SMM) {
    req.smm = await Smm.findOne({ user: user._id });
    if (!req.smm) {
      req.smm = await Smm.create({
        user: user._id,
        brand: user.brand || null,
        nidDivision: 'Dhaka',
        verification: { status: 'Pending' },
      });
    }
    const verified = req.smm.verification?.status === 'Verified';
    if (
      !verified &&
      !req.originalUrl.startsWith('/api/auth') &&
      !req.originalUrl.startsWith('/api/smms/me/nid')
    ) {
      throw ApiError.forbidden('Your NID verification is not complete yet', { code: 'NID_NOT_VERIFIED' });
    }
  }
  next();
}

export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role)) throw ApiError.forbidden();
    next();
  };

/** Platform admins only. An admin acting as a brand is brand-scoped and does not pass. */
export function requirePlatformAdmin(req, _res, next) {
  if (!req.user || !isPlatformAdmin(req.user)) {
    throw ApiError.forbidden('Only platform admins can perform this action');
  }
  next();
}

/** Requires the caller to be an SMM with an active SMM profile. */
export function requireSmm(req, _res, next) {
  if (req.user?.role !== ROLES.SMM || !req.smm) {
    throw ApiError.forbidden('This action is only available to SMMs');
  }
  if (req.smm.status !== 'Active') throw ApiError.forbidden('Your SMM profile is suspended');
  next();
}
