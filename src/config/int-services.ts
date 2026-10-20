import { generateKeyPairSync } from "crypto";
import { Logger, JwtService } from "../common";
import { RedisClient } from "../common/redis/client";
import { Config } from ".";

export const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

const resolveJwtKeys = (): { privateKey: string; publicKey: string } => {
  const privateKey = Config.jwt.privateKey?.trim();
  const publicKey = Config.jwt.publicKey?.trim();
  if (privateKey && publicKey) return { privateKey, publicKey };

  if (Config.nodeEnv === "production") {
    throw new Error(
      "JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set to non-empty PEM values (RS256).",
    );
  }

  logger.warn("JWT keys not configured - using an ephemeral RS256 keypair for this process");
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
};

const jwtKeys = resolveJwtKeys();

export const jwt = new JwtService(jwtKeys.privateKey, jwtKeys.publicKey, Config.jwt.accessTtl);

export const redis = new RedisClient({
  keyPrefix: Config.redis.keyPrefix || "trs",
  ttl: Config.redis.ttl,
});
