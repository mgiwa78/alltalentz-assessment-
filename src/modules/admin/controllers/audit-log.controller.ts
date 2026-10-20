import { Response, NextFunction } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { AuthenticatedRequest } from "@/common/types";
import { sendSuccessResponse } from "@/common/helpers";
import { AuditLogService } from "../services/audit-log.service";

export class AdminAuditLogController {
  private auditLogService: AuditLogService;

  constructor(dataSource: DataSource, redis: RedisClient) {
    this.auditLogService = new AuditLogService(dataSource, redis);
  }

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.auditLogService.listAuditLogs(req.validated, req.filterOptions);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };
}
