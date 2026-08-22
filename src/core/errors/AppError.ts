export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

// Distinct codes (not just 401/403) so the frontend can branch on exactly
// this case — force logout vs. a generic auth failure — instead of fragile
// string-matching on `message`. Thrown by requireAuth on every request, not
// just at login, so deactivation takes effect on the very next API call.
export class AccountInactiveError extends AppError {
  constructor(message = 'Your account has been deactivated. Contact your administrator.') {
    super(401, 'ACCOUNT_INACTIVE', message);
  }
}

export class RegionInactiveError extends AppError {
  constructor(message = 'Your region has been deactivated. Contact your administrator.') {
    super(403, 'REGION_INACTIVE', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Validation failed') {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}
