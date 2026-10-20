import { Router } from "express";
import { DataSource } from "typeorm";
import { JwtService, RedisClient, authMiddleware } from "@/common";
import { emptySchema, validate } from "@/common/middleware/validation";
import { RateLimitPresets } from "@/common/middleware/rate-limiter";
import { AuthController } from "../controllers/auth.controller";
import { loginSchema, refreshTokenSchema } from "../validation/auth.validation";

export const createAuthRoutes = (
  jwtService: JwtService,
  dataSource: DataSource,
  redis: RedisClient,
) => {
  const router = Router();
  const authController = new AuthController(dataSource, redis, jwtService);

  router.post("/login", RateLimitPresets.login(redis), validate(loginSchema), authController.login);
  router.post("/refresh", validate(refreshTokenSchema), authController.refreshToken);
  router.post("/logout", validate(refreshTokenSchema), authController.logout);
  router.get("/me", authMiddleware(jwtService), validate(emptySchema), authController.me);

  return router;
};
