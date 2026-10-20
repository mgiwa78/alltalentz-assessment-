import { User } from "@/database/entities";
import { AppDataSource } from "@/config/data-source";
import { JwtService } from "../auth/jwt";
import { UserPayload } from "../types";
import { UnauthorizedError } from "../errors";

export interface LoadedAuthContext {
  user: User;
  token: string;
  exp: number;
}

export async function loadAuthenticatedUserContext(
  jwtService: JwtService,
  token: string,
): Promise<LoadedAuthContext> {
  const decoded = jwtService.verify<UserPayload>(token);

  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id: decoded.userId },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid token");
  }

  assertSessionUsable(user, decoded.iat);

  return { user, token, exp: decoded.exp };
}

export function assertSessionUsable(user: User, issuedAtSeconds: number): void {
  if (!user.isActive) {
    throw new UnauthorizedError("Your account has been deactivated. Please contact an administrator.");
  }

  if (user.sessionsRevokedAt) {
    const revokedAtSeconds = Math.floor(new Date(user.sessionsRevokedAt).getTime() / 1000);
    if (issuedAtSeconds <= revokedAtSeconds) {
      throw new UnauthorizedError("Session has been revoked. Please log in again.");
    }
  }
}
