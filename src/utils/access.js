import mongoose from '../lib/mongoose.js';
import { ROLES, STAFF_ROLES } from '../constants.js';
import { ApiError } from './ApiError.js';

export const idOf = (v) => String(v?._id ?? v);
export const sameId = (a, b) => a != null && b != null && idOf(a) === idOf(b);

/** A platform admin is an ADMIN not bound to a single brand. */
export const isPlatformAdmin = (user) => user.role === ROLES.ADMIN && !user.brand;
export const isStaff = (user) => STAFF_ROLES.includes(user.role);

export function assertBrandAccess(req, brandId) {
  if (isPlatformAdmin(req.user)) return;
  if (!sameId(req.user.brand, brandId)) {
    throw ApiError.forbidden('You do not have access to this brand');
  }
}

/** Mongo filter restricting list queries to the brands the caller can see. */
export function brandFilter(req) {
  if (isPlatformAdmin(req.user)) {
    const requested = req.query.brand;
    if (!requested) return {};
    if (!mongoose.isValidObjectId(String(requested))) throw ApiError.badRequest('Invalid brand id');
    return { brand: new mongoose.Types.ObjectId(String(requested)) };
  }
  return { brand: req.user.brand };
}

/** Brand a newly created resource belongs to. Platform admins must say which one. */
export function brandForWrite(req, requestedBrandId) {
  if (isPlatformAdmin(req.user)) {
    if (!requestedBrandId) throw ApiError.badRequest('brandId is required');
    return new mongoose.Types.ObjectId(String(requestedBrandId));
  }
  if (requestedBrandId && !sameId(requestedBrandId, req.user.brand)) {
    throw ApiError.forbidden('You can only create resources for your own brand');
  }
  return req.user.brand;
}
