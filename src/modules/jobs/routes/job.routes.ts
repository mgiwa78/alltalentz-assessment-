import { Router } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { validate } from "@/common/middleware/validation";
import { requireRole } from "@/common/middleware/role.middleware";
import { RateLimitPresets } from "@/common/middleware/rate-limiter";
import { UserRole } from "@/database/enums/trs.enums";
import { JobController } from "../controllers/job.controller";
import {
  createJobSchema,
  estimateJobSchema,
  jobIdParamSchema,
  listJobsQuerySchema,
  updateJobStatusSchema,
} from "../validation/job.validation";

export const createJobRoutes = (dataSource: DataSource, redis: RedisClient) => {
  const router = Router();
  const controller = new JobController(dataSource, redis);
  const estimators = requireRole(UserRole.ESTIMATOR);

  router.post("/", estimators, validate(createJobSchema), controller.create);
  router.get("/", validate(listJobsQuerySchema), controller.list);
  router.get("/:id", validate(jobIdParamSchema), controller.getById);
  router.get("/:id/status-history", validate(jobIdParamSchema), controller.statusHistory);
  router.patch("/:id/status", validate(updateJobStatusSchema), controller.updateStatus);
  router.post("/:id/estimate", estimators, validate(estimateJobSchema), controller.estimate);
  router.post("/:id/ai-assessment", estimators, validate(jobIdParamSchema), controller.aiAssessment);
  router.post(
    "/:id/ai-assessment/analyze",
    estimators,
    RateLimitPresets.aiAnalysis(redis),
    validate(jobIdParamSchema),
    controller.aiAnalyze,
  );

  return router;
};
