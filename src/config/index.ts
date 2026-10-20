import { z } from "zod";
import dotenv from "dotenv";
import { Logger } from "../common/logger";

dotenv.config();

const configSchema = z.object({
  port: z.string().default("4000").transform(Number),
  nodeEnv: z.enum(["development", "production", "staging", "test"]).default("development"),
  appUrl: z.string().default("http://localhost:4000"),
  database: z.object({
    host: z.string().default("localhost"),
    port: z.string().default("5432").transform(Number),
    username: z.string().default("postgres"),
    password: z.string().default("postgres"),
    name: z.string().default("trs_restoration"),
    ssl: z.boolean().default(false),
  }),
  redis: z.object({
    driver: z.enum(["redis", "memory"]).default("redis"),
    host: z.string().default("localhost"),
    username: z.string().default(""),
    port: z.string().default("6379").transform(Number),
    password: z.string().default(""),
    db: z.string().default("0").transform(Number),
    keyPrefix: z.string().default("trs"),
    ttl: z.string().default("3600").transform(Number),
  }),
  allowedOrigins: z.array(z.string()).default(["http://localhost:3000"]),
  jwt: z.object({
    accessTtl: z.string().default("15m"),
    refreshTtl: z.string().default("7d"),
    publicKey: z.string().optional(),
    privateKey: z.string().optional(),
  }),
  rateLimit: z.object({
    windowMs: z.string().default("900000").transform(Number),
    maxRequests: z.string().default("1000").transform(Number),
    multiplier: z.string().default("1").transform(Number),
  }),
  service: z.object({
    name: z.string().default("trs-restoration-api"),
    version: z.string().default("1.0.0"),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }),
  ai: z.object({
    apiKey: z.string().default(""),
    model: z.string().default("claude-opus-5-5"),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
    timeoutMs: z.string().default("120000").transform(Number),
  }),
});

const Config = configSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  appUrl: process.env.APP_URL,
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true",
  },
  redis: {
    driver: process.env.REDIS_DRIVER as "redis" | "memory" | undefined,
    host: process.env.REDIS_HOST,
    username: process.env.REDIS_USERNAME,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    ttl: process.env.REDIS_TTL,
  },
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000"],
  jwt: {
    accessTtl: process.env.JWT_ACCESS_TTL,
    refreshTtl: process.env.JWT_REFRESH_TTL,
    publicKey: process.env.JWT_PUBLIC_KEY,
    privateKey: process.env.JWT_PRIVATE_KEY,
  },
  rateLimit: {
    windowMs: process.env.RATE_LIMIT_WINDOW_MS,
    maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
    multiplier: process.env.RATE_LIMIT_MULTIPLIER,
  },
  service: {
    name: process.env.SERVICE_NAME,
    version: process.env.SERVICE_VERSION,
  },
  logging: {
    level: process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error" | undefined,
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AI_MODEL,
    effort: process.env.AI_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined,
    timeoutMs: process.env.AI_TIMEOUT_MS,
  },
});

const bootLogger = new Logger({
  level: Config.logging.level,
  service: "config",
});
bootLogger.info(`Environment: ${Config.nodeEnv}`);
bootLogger.info(
  `Database: ${Config.database.host}:${Config.database.port}/${Config.database.name}`,
);

export function getAppUrl(): string {
  return Config.appUrl;
}

export { Config };
