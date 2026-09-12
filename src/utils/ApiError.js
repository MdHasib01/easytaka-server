export class ApiError extends Error {
  constructor(status, message, { details, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }

  static badRequest(message = 'Bad request', opts) {
    return new ApiError(400, message, opts);
  }

  static unauthorized(message = 'Authentication required', opts) {
    return new ApiError(401, message, opts);
  }

  static forbidden(message = 'You do not have permission to perform this action', opts) {
    return new ApiError(403, message, opts);
  }

  static notFound(message = 'Resource not found', opts) {
    return new ApiError(404, message, opts);
  }

  static conflict(message = 'Conflict', opts) {
    return new ApiError(409, message, opts);
  }
}
