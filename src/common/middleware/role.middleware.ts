import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { UserRole } from "@/database/enums/trs.enums";

export const hasRole = (
  role: UserRole | null | undefined,
  allowed: readonly UserRole[],
): boolean => !!role && (role === UserRole.ADMIN || allowed.includes(role));

export const requireRole = (...allowed: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!hasRole(req.user.role, allowed)) {
      return next(
        new ForbiddenError(`Requires one of: ${[UserRole.ADMIN, ...allowed].join(", ")}`),
      );
    }
    next();
  };
};
