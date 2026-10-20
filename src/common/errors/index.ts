import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { QueryFailedError } from "typeorm";
import { Logger } from "../logger";

const logger = new Logger({ level: process.env.LOG_LEVEL ?? "info", service: "error-handler" });

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  path: string;
  method: string;
  timestamp: string;
  userAgent?: string;
  ip?: string;
}

export class AppError extends Error {
  public readonly isOperational = true;

  constructor(
    message: string,
    public status: number = 500,
    public code: string = "INTERNAL_SERVER_ERROR",
    public details?: unknown,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
      context: this.context,
      stack: this.stack,
    };
  }
}

const buildErrorContext = (req: Request): ErrorContext => {
  const user = (req as any).user;

  return {
    requestId: (req as any).requestId || req.get("X-Request-ID"),
    userId: user?.id,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get("User-Agent"),
    ip: req.ip || req.socket.remoteAddress,
  };
};

const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "key",
  "authorization",
  "refreshtoken",
  "accesstoken",
]);

const sanitizeBody = (body: any, depth = 0): any => {
  if (depth > 5 || !body || typeof body !== "object") return body;
  if (Array.isArray(body)) return body.map((v) => sanitizeBody(v, depth + 1));

  const sanitized: Record<string, any> = {};
  for (const [field, value] of Object.entries(body)) {
    sanitized[field] = SENSITIVE_FIELDS.has(field.toLowerCase())
      ? "[REDACTED]"
      : sanitizeBody(value, depth + 1);
  }
  return sanitized;
};

const sendError = (
  res: Response,
  context: ErrorContext,
  status: number,
  message: string,
  code: string,
  extra: { details?: unknown; stack?: string } = {},
): void => {
  res.status(status).json({
    success: false,
    message,
    code,
    ...(extra.details !== undefined ? { details: extra.details } : {}),
    ...(extra.stack ? { stack: extra.stack } : {}),
    timestamp: context.timestamp,
    requestId: context.requestId,
  });
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const context = buildErrorContext(req);
  const isDevelopment = process.env.NODE_ENV === "development";
  const request = {
    body: sanitizeBody(req.body),
    query: req.query,
    params: req.params,
  };

  if (err instanceof AppError) {
    logger.warn("Operational error", {
      error: {
        name: err.name,
        message: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      },
      context,
      request,
    });

    sendError(res, context, err.status, err.message, err.code, {
      details: err.details,
      stack: isDevelopment ? err.stack : undefined,
    });
    return;
  }

  if (err instanceof ZodError) {
    logger.warn("Validation error", {
      error: { name: err.name, issues: err.issues },
      context,
      request,
    });

    sendError(res, context, 400, "Validation failed", "VALIDATION_ERROR", {
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if ((err as any).type === "entity.parse.failed") {
    logger.warn("Malformed JSON body", { context });
    sendError(res, context, 400, "Request body is not valid JSON", "MALFORMED_JSON");
    return;
  }

  if (err instanceof QueryFailedError) {
    const dbError = err as any;

    logger.error("Database error", err, {
      code: dbError.code,
      detail: dbError.detail,
      constraint: dbError.constraint,
      context,
      request,
    });

    let status = 500;
    let message = "Database operation failed";
    let code = "DATABASE_ERROR";

    if (dbError.code === "23505") {
      status = 409;
      message = "Resource already exists";
      code = "DUPLICATE_RESOURCE";
    } else if (dbError.code === "23503") {
      status = 400;
      message = "Invalid reference";
      code = "INVALID_REFERENCE";
    } else if (dbError.code === "23502") {
      status = 400;
      message = "Required field missing";
      code = "REQUIRED_FIELD_MISSING";
    }

    sendError(res, context, status, message, code, {
      details: isDevelopment
        ? { code: dbError.code, detail: dbError.detail, constraint: dbError.constraint }
        : undefined,
    });
    return;
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    logger.warn("JWT error", {
      error: { name: err.name, message: err.message },
      context,
    });

    sendError(res, context, 401, "Invalid or expired token", "INVALID_TOKEN");
    return;
  }

  logger.error("Unexpected error", err, {
    error: { name: err.name, message: err.message },
    context,
    request,
    stack: err.stack,
  });

  sendError(
    res,
    context,
    500,
    isDevelopment ? err.message : "Internal server error",
    "INTERNAL_SERVER_ERROR",
    { stack: isDevelopment ? err.stack : undefined },
  );
};

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId =
    req.get("X-Request-ID") ||
    `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  (req as any).requestId = requestId;
  res.set("X-Request-ID", requestId);
  next();
};

export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    context?: Record<string, any>
  ) {
    super(message, 400, "VALIDATION_ERROR", details, context);
  }
}

export class InternalServerError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    context?: Record<string, any>
  ) {
    super(message, 500, "INTERNAL_SERVER_ERROR", details, context);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", context?: Record<string, any>) {
    super(message, 401, "UNAUTHORIZED", undefined, context);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message: string = "Access denied",
    context?: Record<string, any>
  ) {
    super(message, 403, "FORBIDDEN", undefined, context);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = "Resource not found",
    context?: Record<string, any>
  ) {
    super(message, 404, "NOT_FOUND", undefined, context);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    context?: Record<string, any>
  ) {
    super(message, 409, "CONFLICT", details, context);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message: string = "Too many requests",
    context?: Record<string, any>
  ) {
    super(message, 429, "TOO_MANY_REQUESTS", undefined, context);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, "BAD_REQUEST", undefined, context);
  }
}

export class BadGatewayError extends AppError {
  constructor(message: string = "Upstream service failed", details?: unknown) {
    super(message, 502, "BAD_GATEWAY", details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = "Service temporarily unavailable",
    context?: Record<string, any>
  ) {
    super(message, 503, "SERVICE_UNAVAILABLE", undefined, context);
  }
}

export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};
