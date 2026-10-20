import { Request, Response, NextFunction } from "express";
import { z, ZodObject, ZodError, ZodTypeAny } from "zod";
import { ValidationError } from "../errors";
import { getFilterOptions, DEFAULT_LIMIT, MAX_LIMIT } from "../types";

export const emptySchema = z.object({});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  sort: z
    .string()
    .regex(/^[A-Za-z]+:(asc|desc|ASC|DESC)$/, "Use field:asc or field:desc")
    .optional(),
  search: z.string().trim().max(200).optional(),
});

export const validate = (schema: ZodObject | ZodTypeAny) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        ...req.body,
        ...req.query,
        ...req.params
      });
      (req as any).validated = parsed;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body)
      ) {
        const out = parsed as Record<string, unknown>;
        for (const key of Object.keys(req.body)) {
          if (!(key in out)) continue;
          if (out[key] === undefined) delete req.body[key];
          else req.body[key] = out[key];
        }
        for (const key of Object.keys(out)) {
          if (key in req.body || key in req.query || key in req.params) continue;
          if (out[key] !== undefined) req.body[key] = out[key];
        }
      }

      if (req.method === "GET") {
        const forFilters =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? { ...req.query, ...(parsed as Record<string, unknown>) }
            : parsed;
        req.filterOptions = getFilterOptions(forFilters);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = (error as any).issues ?? (error as any).errors ?? [];
        const formattedErrors = issues.map((err: any) => ({
          path: Array.isArray(err.path) ? err.path.join(".") : "",
          message: err.message
        }));
        next(new ValidationError("Validation failed", formattedErrors));
      } else {
        next(error);
      }
    }
  };
};

export const createRouteValidator = <T extends ZodObject>(schema: T) => {
  return {
    validate: validate(schema)
  };
};
