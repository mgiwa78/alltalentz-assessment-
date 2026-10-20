import { Router } from "express";
import { DataSource } from "typeorm";
import { JwtService, RedisClient, authMiddleware, requireRole } from "@/common";
import { createAdminUserRoutes } from "./user.routes";
import { createAdminAuditLogRoutes } from "./audit-log.routes";

export const createAdminRoutes = (
  jwtService: JwtService,
  dataSource: DataSource,
  redis: RedisClient,
) => {
  const router = Router();

  router.use("/", authMiddleware(jwtService), requireRole());

  router.use("/", createAdminUserRoutes(dataSource, redis));
  router.use("/", createAdminAuditLogRoutes(dataSource, redis));

  return router;
};
