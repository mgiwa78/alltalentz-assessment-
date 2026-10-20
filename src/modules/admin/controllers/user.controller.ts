import { Response, NextFunction } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { AuthenticatedRequest } from "@/common/types";
import { sendSuccessResponse } from "@/common/helpers";
import { getActor } from "@/common/helpers/actor";
import { UserManagementService } from "../services/user-management.service";

export class AdminUserController {
  private userManagementService: UserManagementService;

  constructor(dataSource: DataSource, redis: RedisClient) {
    this.userManagementService = new UserManagementService(dataSource, redis);
  }

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.userManagementService.listUsers(req.validated, req.filterOptions);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.userManagementService.createUser(getActor(req), req.validated);
      return sendSuccessResponse(res, result, 201, "User created");
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.userManagementService.updateUser(getActor(req), req.validated);
      return sendSuccessResponse(res, result, 200, "User updated");
    } catch (error) {
      next(error);
    }
  };
}
