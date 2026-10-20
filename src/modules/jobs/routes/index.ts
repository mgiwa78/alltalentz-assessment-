import { Router } from "express";
import { DataSource } from "typeorm";
import { JwtService, RedisClient, authMiddleware } from "@/common";
import { createJobRoutes } from "./job.routes";

export const createJobsModuleRoutes = (
  jwtService: JwtService,
  dataSource: DataSource,
  redis: RedisClient,
) => {
  const router = Router();

  router.use("/", authMiddleware(jwtService));
  router.use("/", createJobRoutes(dataSource, redis));

  return router;
};
