import { Response, NextFunction } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { AuthenticatedRequest } from "@/common/types";
import { sendSuccessResponse } from "@/common/helpers";
import { getActor } from "@/common/helpers/actor";
import { JobService } from "../services/job.service";
import { AiAssessmentService } from "../services/ai-assessment.service";

export class JobController {
  private jobService: JobService;
  private aiAssessmentService: AiAssessmentService;

  constructor(dataSource: DataSource, redis: RedisClient) {
    this.jobService = new JobService(dataSource, redis);
    this.aiAssessmentService = new AiAssessmentService(dataSource, redis);
  }

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.jobService.createJob(getActor(req), req.validated);
      return sendSuccessResponse(res, result, 201, "Job created");
    } catch (error) {
      next(error);
    }
  };

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.jobService.listJobs(req.validated, req.filterOptions);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.jobService.getJobDetail(req.validated.id);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.jobService.updateStatus(getActor(req), req.validated);
      return sendSuccessResponse(res, result, 200, "Job status updated");
    } catch (error) {
      next(error);
    }
  };

  estimate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.jobService.submitEstimate(getActor(req), req.validated);
      return sendSuccessResponse(res, result, 200, "Estimate saved");
    } catch (error) {
      next(error);
    }
  };

  statusHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.jobService.getStatusHistory(req.validated.id);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  aiAssessment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.aiAssessmentService.buildPayload(req.validated.id);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  aiAnalyze = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.aiAssessmentService.analyze(getActor(req), req.validated.id);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };
}
