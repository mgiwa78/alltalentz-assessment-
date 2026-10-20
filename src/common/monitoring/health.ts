import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { RedisClient } from "../redis/client";
import { Config } from "@/config";

export interface HealthCheck {
  name: string;
  status: "healthy" | "unhealthy";
  message?: string;
}

export interface SystemHealth {
  status: "healthy" | "unhealthy";
  checks: HealthCheck[];
  uptime: number;
  timestamp: Date;
}

export class HealthMonitor {
  private static instance: HealthMonitor;
  private startTime: Date;

  private constructor(
    private dataSource: DataSource,
    private redis?: RedisClient
  ) {
    this.startTime = new Date();
  }

  static initialize(
    dataSource: DataSource,
    redis?: RedisClient
  ): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor(dataSource, redis);
    }
    return HealthMonitor.instance;
  }

  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      throw new Error("HealthMonitor must be initialized first");
    }
    return HealthMonitor.instance;
  }

  async performHealthCheck(): Promise<SystemHealth> {
    const checks: HealthCheck[] = [];

    try {
      if (!this.dataSource.isInitialized) {
        checks.push({
          name: "database",
          status: "unhealthy",
          message: "Not initialized",
        });
      } else {
        await this.dataSource.query("SELECT 1");
        checks.push({ name: "database", status: "healthy" });
      }
    } catch (error) {
      checks.push({
        name: "database",
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Connection failed",
      });
    }

    if (this.redis) {
      try {
        const testKey = `health_${Date.now()}`;
        await this.redis.set(testKey, "test", 10);
        const result = await this.redis.get(testKey);
        await this.redis.del(testKey);
        checks.push({
          name: "redis",
          status: result === "test" ? "healthy" : "unhealthy",
        });
      } catch (error) {
        checks.push({
          name: "redis",
          status: "unhealthy",
          message: error instanceof Error ? error.message : "Connection failed",
        });
      }
    }

    const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    checks.push({
      name: "memory",
      status: rssMB > 2048 ? "unhealthy" : "healthy",
      message: rssMB > 2048 ? `High memory usage (${rssMB}MB)` : undefined,
    });

    const overallStatus = checks.some((c) => c.status === "unhealthy")
      ? "unhealthy"
      : "healthy";

    return {
      status: overallStatus,
      checks,
      uptime: Date.now() - this.startTime.getTime(),
      timestamp: new Date(),
    };
  }

  healthEndpoint() {
    return async (_req: Request, res: Response) => {
      try {
        const health = await this.performHealthCheck();
        const statusCode = health.status === "healthy" ? 200 : 503;

        if (Config.nodeEnv === "production") {
          res.status(statusCode).json({
            status: health.status,
            uptime: health.uptime,
            timestamp: health.timestamp,
            checks: health.checks.map((c) => ({
              name: c.name,
              status: c.status
            }))
          });
          return;
        }

        res.status(statusCode).json(health);
      } catch {
        res.status(503).json({
          status: "unhealthy",
          message: "Health check failed",
          timestamp: new Date(),
        });
      }
    };
  }
}
