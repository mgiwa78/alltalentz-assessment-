import { Router } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { validate } from "@/common/middleware/validation";
import { AdminAuditLogController } from "../controllers/audit-log.controller";
import { listAuditLogsQuerySchema } from "../validation/audit-log.validation";

export const createAdminAuditLogRoutes = (dataSource: DataSource, redis: RedisClient) => {
  const router = Router();
  const controller = new AdminAuditLogController(dataSource, redis);

  router.get("/audit-logs", validate(listAuditLogsQuerySchema), controller.list);

  return router;
};
