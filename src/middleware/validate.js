import { ApiError } from '../utils/ApiError.js';

/** Validates and replaces req.body with the parsed (stripped, coerced) value. */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', {
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  req.body = result.data;
  next();
};
