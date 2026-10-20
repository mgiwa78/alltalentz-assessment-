import { Router } from "express";
import { DataSource } from "typeorm";
import { NotFoundError, errorHandler, authMiddleware, requireRole } from "@/common";
import { AuditLogger } from "@/common/monitoring/audit";
import { redis, jwt } from "@/config/int-services";
import { Config } from "@/config";
import { HealthMonitor } from "@/common/monitoring/health";
import { MetricsCollector } from "@/common/monitoring/metrics";
import { Logger } from "@/common/logger";
import { RateLimitPresets } from "@/common/middleware/rate-limiter";
import { createGlobalRoutes } from "@/modules/global/routes";
import { createJobsModuleRoutes } from "@/modules/jobs/routes";
import { createAdminRoutes } from "@/modules/admin/routes";

const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

const initMonitoring = (dataSource: DataSource) => {
  const healthMonitor = HealthMonitor.initialize(dataSource, redis);
  AuditLogger.initialize(dataSource);
  const metricsCollector = MetricsCollector.getInstance();
  return { healthMonitor, metricsCollector };
};

export const createRootRoutes = (dataSource: DataSource) => {
  const rootRouter = Router();
  const { healthMonitor, metricsCollector } = initMonitoring(dataSource);

  rootRouter.use("/", RateLimitPresets.general(redis, jwt));

  rootRouter.get("/", (_req, res) => {
    res.json({
      name: Config.service.name,
      version: Config.service.version,
      status: "running",
      docs: "/api/docs",
      timestamp: new Date().toISOString(),
    });
  });

  rootRouter.get("/health", healthMonitor.healthEndpoint());
  rootRouter.get("/metrics", authMiddleware(jwt), requireRole(), (_req, res) => {
    res.json(metricsCollector.getMetricsSummary());
  });

  rootRouter.use("/", createGlobalRoutes(jwt, dataSource, redis));
  rootRouter.use("/jobs", createJobsModuleRoutes(jwt, dataSource, redis));
  rootRouter.use("/admin", createAdminRoutes(jwt, dataSource, redis));

  rootRouter.use((req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
  });
  rootRouter.use(errorHandler);

  logger.info("TRS API routes mounted");

  return rootRouter;
};
