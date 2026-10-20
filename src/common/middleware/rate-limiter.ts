import { Request, Response, NextFunction } from "express";
import { RedisClient } from "@/common/redis/client";
import { TooManyRequestsError } from "@/common/errors";
import { Logger } from "@/common/logger";
import { Config } from "@/config";
import type { JwtService } from "@/common/auth/jwt";

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

export class RateLimiter {
  private redis: RedisClient;
  private logger: Logger;
  private options: Required<RateLimiterOptions>;

  constructor(redis: RedisClient, options: RateLimiterOptions) {
    this.redis = redis;
    this.logger = new Logger({ level: "info", service: "rate-limiter" });
    this.options = {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      message: options.message || "Too many requests, please try again later.",
      keyGenerator:
        options.keyGenerator || ((req) => this.getClientIdentifier(req)),
      skipSuccessfulRequests: options.skipSuccessfulRequests || false,
      skipFailedRequests: options.skipFailedRequests || false,
      handler:
        options.handler ||
        (() => {
          throw new TooManyRequestsError(this.options.message);
        }),
    };
  }

  private getClientIdentifier(req: Request): string {
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
  }

  middleware = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const key = `rate_limit:${this.options.keyGenerator(req)}`;
      const now = Date.now();
      const windowStart = now - this.options.windowMs;

      const results = await this.redis.redis
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`)
        .zcard(key)
        .zrange(key, 0, 0, "WITHSCORES")
        .expire(key, Math.ceil(this.options.windowMs / 1000))
        .exec();

      const currentCount = Number(results?.[2]?.[1] ?? 0);
      const oldest = Number((results?.[3]?.[1] as string[] | undefined)?.[1] ?? now);

      if (currentCount > this.options.maxRequests) {
        const resetTime = oldest + this.options.windowMs;
        const retryAfter = Math.max(1, Math.ceil((resetTime - now) / 1000));

        res.setHeader("X-RateLimit-Limit", this.options.maxRequests.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", resetTime.toString());
        res.setHeader("Retry-After", retryAfter.toString());

        this.logger.warn("Rate limit exceeded", { key, currentCount, limit: this.options.maxRequests });

        return this.options.handler(req, res, next);
      }

      res.setHeader("X-RateLimit-Limit", this.options.maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", Math.max(0, this.options.maxRequests - currentCount).toString());
      res.setHeader("X-RateLimit-Reset", (now + this.options.windowMs).toString());

      next();
    } catch (error) {
      if (error instanceof TooManyRequestsError) return next(error);
      this.logger.error("Rate limiter unavailable - allowing request", error as Error);
      next();
    }
  };
}

export const createRateLimiter = (
  redis: RedisClient,
  options: RateLimiterOptions,
): ((req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  const limiter = new RateLimiter(redis, options);
  return limiter.middleware;
};

const scaled = (max: number) => Math.max(1, Math.round(max * Config.rateLimit.multiplier));

const loginEmailKey = (req: Request) => {
  const email = req.body?.email;
  return typeof email === "string" && email.trim()
    ? email.trim().toLowerCase()
    : `ip:${req.ip || "unknown"}`;
};

export const RateLimitPresets = {
  general: (redis: RedisClient, jwtService: JwtService) =>
    createRateLimiter(redis, {
      windowMs: Config.rateLimit.windowMs,
      maxRequests: scaled(Config.rateLimit.maxRequests),
      message: "Too many requests, please try again later.",
      keyGenerator: (req) => {
        const ipKey = `general:ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
        const token = req.headers.authorization?.startsWith("Bearer ")
          ? req.headers.authorization.slice(7)
          : undefined;
        if (!token) return ipKey;
        try {
          return `general:user:${jwtService.verify(token).userId}`;
        } catch {
          return ipKey;
        }
      },
    }),

  login: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 15 * 60 * 1000,
      maxRequests: scaled(20),
      message: "Too many login attempts, please try again later.",
      keyGenerator: (req) => `auth-login:${loginEmailKey(req)}`,
    }),

  aiAnalysis: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 60 * 60 * 1000,
      maxRequests: scaled(30),
      message: "AI analysis limit reached, please try again later.",
      keyGenerator: (req) => `ai-analysis:${(req as any).user?.id ?? req.ip}`,
    }),
};
