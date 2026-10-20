import { Request, Response, NextFunction } from "express";
import { DataSource } from "typeorm";
import { JwtService } from "@/common/auth/jwt";
import { RedisClient } from "@/common";
import { AuthenticatedRequest } from "@/common/types";
import { sendSuccessResponse } from "@/common/helpers";
import { getActor } from "@/common/helpers/actor";
import { AuthService } from "../services/auth.service";

export class AuthController {
  private authService: AuthService;

  constructor(dataSource: DataSource, redis: RedisClient, jwtService: JwtService) {
    this.authService = new AuthService(dataSource, redis, jwtService);
  }

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.login(req.validated.email, req.validated.password);
      return sendSuccessResponse(res, result);
    } catch (error) {
      next(error);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await this.authService.refreshToken(req.validated.refreshToken);
      return sendSuccessResponse(res, tokens);
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.authService.logout(req.validated.refreshToken);
      return sendSuccessResponse(res, { message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  };

  me = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      return sendSuccessResponse(res, this.authService.me(getActor(req)));
    } catch (error) {
      next(error);
    }
  };
}
