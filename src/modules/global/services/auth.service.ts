import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { JwtService } from "@/common/auth/jwt";
import { RedisClient } from "@/common";
import { UnauthorizedError } from "@/common/errors";
import { durationToSeconds, hashPassword, verifyPassword } from "@/common/helpers";
import { assertSessionUsable } from "@/common/middleware/jwt-user.loader";
import { AuditLogger } from "@/common/monitoring/audit";
import { TokenResponse, UserPayload } from "@/common/types";
import { Config } from "@/config";
import { User } from "@/database/entities";
import { PublicUser, UserRepository } from "../repositories/user.repository";

export interface LoginResult extends TokenResponse {
  user: PublicUser;
}

let timingDummyHash: Promise<string> | undefined;
const getTimingDummyHash = () => (timingDummyHash ??= hashPassword("timing-equalizer"));

const audit = (action: Parameters<AuditLogger["logAuth"]>[0], userId?: string, metadata?: Record<string, any>) => {
  try {
    AuditLogger.getInstance().logAuth(action, userId, metadata).catch(() => undefined);
  } catch {
    return;
  }
};

export class AuthService {
  private userRepository: UserRepository;

  constructor(
    dataSource: DataSource,
    private redis: RedisClient,
    private jwtService: JwtService,
  ) {
    this.userRepository = new UserRepository(dataSource, redis);
  }

  login = async (email: string, password: string): Promise<LoginResult> => {
    const user = await this.userRepository.findByEmailWithPassword(email);
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getTimingDummyHash()));

    if (!user || !passwordOk) {
      audit("login_failed", user?.id, { email });
      throw new UnauthorizedError("Invalid email or password");
    }
    if (!user.isActive) {
      throw new UnauthorizedError("Your account has been deactivated. Please contact an administrator.");
    }

    await this.userRepository.update(user.id, { lastLoginAt: new Date() });
    audit("login", user.id);

    const tokens = await this.issueTokens(user);
    const fresh = await this.userRepository.findById(user.id);
    return { ...tokens, user: this.userRepository.formatEntityForResponse(fresh ?? user) };
  };

  issueTokens = async (user: User): Promise<TokenResponse> => {
    const accessToken = this.jwtService.sign<UserPayload>({ userId: user.id }, Config.jwt.accessTtl);

    const jti = randomUUID();
    const refreshToken = this.jwtService.sign<UserPayload>({ userId: user.id, jti }, Config.jwt.refreshTtl);
    await this.redis.set(`refresh:${jti}`, user.id, durationToSeconds(Config.jwt.refreshTtl));

    return { accessToken, refreshToken };
  };

  refreshToken = async (token: string): Promise<TokenResponse> => {
    const decoded = this.jwtService.verify<UserPayload>(token);
    if (!decoded.jti) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const storedUserId = await this.redis.get(`refresh:${decoded.jti}`);
    if (!storedUserId || storedUserId !== decoded.userId) {
      throw new UnauthorizedError("Refresh token revoked or expired");
    }

    await this.redis.del(`refresh:${decoded.jti}`);

    const user = await this.userRepository.findById(decoded.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    assertSessionUsable(user, decoded.iat);

    audit("token_refreshed", user.id);
    return this.issueTokens(user);
  };

  logout = async (refreshTokenValue: string): Promise<void> => {
    try {
      const decoded = this.jwtService.verify<UserPayload>(refreshTokenValue);
      if (decoded.jti) {
        await this.redis.del(`refresh:${decoded.jti}`);
        audit("logout", decoded.userId);
      }
    } catch {
      return;
    }
  };

  me = (user: User): PublicUser => this.userRepository.formatEntityForResponse(user);
}
