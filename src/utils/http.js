import { z } from 'zod';
import { ApiError } from './ApiError.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// Only http(s) links are accepted so stored URLs are safe to render as hrefs.
export const httpUrl = z.url({ protocol: /^https?$/, error: 'Must be a valid http(s) URL' }).max(2000);

export const optionalUrl = httpUrl.optional().or(z.literal('').transform(() => undefined));

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email address').max(200);
export const passwordSchema = z.string().min(6, 'Password must be at least 6 characters').max(128);

export const reviewSchema = z.object({
  action: z.enum(['Approve', 'Revision', 'Reject']),
  note: z.string().trim().max(2000).optional(),
});

export function getPagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export const paged = (items, total, { page, limit }) => ({
  items,
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reads a string query parameter and checks it against an allow-list. */
export function queryEnum(value, allowed, name) {
  if (value === undefined || value === '') return undefined;
  const v = String(value);
  if (!allowed.includes(v)) {
    throw ApiError.badRequest(`Invalid ${name}. Allowed: ${allowed.join(', ')}`);
  }
  return v;
}
