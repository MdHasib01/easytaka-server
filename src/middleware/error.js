import multer from 'multer';
import mongoose from '../lib/mongoose.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let { details, code } = err;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err instanceof mongoose.Error.VersionError) {
    status = 409;
    message = 'This record was changed by someone else. Reload and try again.';
  } else if (err?.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyValue || err.keyPattern || {});
    message = `A record with the same ${fields.join(', ') || 'unique value'} already exists`;
    code = 'DUPLICATE';
  } else if (err instanceof multer.MulterError) {
    status = 400;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  const unexpected = status >= 500 && !(err instanceof ApiError);
  if (unexpected) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (env.isProd) message = 'Internal server error';
  }

  res.status(status).json({
    message,
    ...(code && { code }),
    ...(details && { details }),
    ...(!env.isProd && unexpected && { stack: err.stack }),
  });
}
