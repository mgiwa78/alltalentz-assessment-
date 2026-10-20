import jwt, { SignOptions } from "jsonwebtoken";
import { UserPayload, DecodedToken } from "../types";
import { UnauthorizedError } from "../errors";
import { Logger } from "../logger";

export class JwtService {
  private readonly jwtLog = new Logger({
    level: (process.env.LOG_LEVEL as any) ?? "info",
    service: "jwt-service"
  });
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly expiresIn: string;

  constructor(privateKey: string, publicKey: string, expiresIn: string = "15m") {
    this.privateKey = this.normalizeKey(privateKey);
    this.publicKey = this.normalizeKey(publicKey);
    this.expiresIn = expiresIn;

    this.validateKeys();
  }

  private normalizeKey(key: string): string {
    if (!key.includes("-----BEGIN")) {
      try {
        key = Buffer.from(key, "base64").toString("utf-8");
      } catch (error) {
        this.jwtLog.warn("Error normalizing key", {
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return key.replace(/\\n/g, "\n").replace(/"/g, "").trim();
  }

  private validateKeys(): void {
    try {
      const testPayload = {
        test: true,
        exp: Math.floor(Date.now() / 1000) + 60
      };
      const testToken = jwt.sign(testPayload, this.privateKey, {
        algorithm: "RS256"
      });
      jwt.verify(testToken, this.publicKey, { algorithms: ["RS256"] });
    } catch (error) {
      this.jwtLog.error(
        "JWT key validation failed",
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        "Invalid JWT keys provided. Please check your private and public keys."
      );
    }
  }

  sign<T extends UserPayload>(payload: T, expiresIn: string = this.expiresIn): string {
    try {
      const options: SignOptions & { algorithm: "RS256" } = {
        algorithm: "RS256",
        expiresIn: expiresIn as jwt.SignOptions["expiresIn"]
      };
      return jwt.sign(payload, this.privateKey, options);
    } catch (error) {
      this.jwtLog.error(
        "JWT sign error",
        error instanceof Error ? error : new Error(String(error))
      );
      throw new UnauthorizedError("Failed to sign JWT token");
    }
  }

  verify<T extends UserPayload>(token: string): DecodedToken<T> {
    try {
      return jwt.verify(token, this.publicKey, {
        algorithms: ["RS256"]
      }) as DecodedToken<T>;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError("Token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        this.jwtLog.warn("Invalid JWT token", {
          message: error.message
        });
        throw new UnauthorizedError("Invalid token");
      } else {
        throw new UnauthorizedError("Failed to verify token");
      }
    }
  }
}
