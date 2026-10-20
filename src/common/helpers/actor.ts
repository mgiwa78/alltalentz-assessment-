import { AuthenticatedRequest } from "../types";
import { UnauthorizedError } from "../errors";
import { User } from "@/database/entities";

export const getActor = (req: AuthenticatedRequest): User => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};
