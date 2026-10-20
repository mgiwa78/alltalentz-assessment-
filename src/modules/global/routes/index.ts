import { Router } from "express";
import { DataSource } from "typeorm";
import { JwtService, RedisClient } from "@/common";
import { createAuthRoutes } from "./auth.routes";

export const createGlobalRoutes = (
  jwtService: JwtService,
  dataSource: DataSource,
  redis: RedisClient,
) => {
  const router = Router();

  router.use("/auth", createAuthRoutes(jwtService, dataSource, redis));

  return router;
};
