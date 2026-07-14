/**
 * 业务异常基类。
 * 约定：HTTP status 用来给网关/前端定位类别；code 是业务错误码（前端弹窗/埋点用）。
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: number;
  public readonly details?: unknown;

  constructor(message: string, status = 500, code = 5000, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(message, 400, 1001, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 1002);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 1003);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 2001);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 2002);
  }
}
