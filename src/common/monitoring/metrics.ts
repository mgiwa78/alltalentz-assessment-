import { Request, Response, NextFunction } from "express";
import { Logger } from "../logger";

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userId?: string;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private logger: Logger;
  private requestMetrics: RequestMetrics[] = [];

  private constructor() {
    this.logger = new Logger({ level: "info", service: "metrics" });

    setInterval(() => {
      this.flushMetrics();
    }, 60000).unref();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  recordRequest(metrics: RequestMetrics): void {
    this.requestMetrics.push(metrics);

    if (metrics.duration > 1000) {
      this.logger.warn("Slow request detected", {
        method: metrics.method,
        path: metrics.path,
        duration: metrics.duration,
        userId: metrics.userId,
      });
    }
  }

  getMetricsSummary() {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);

    const recentRequests = this.requestMetrics.filter(
      (m) => m.timestamp > last5Minutes
    );

    return {
      requests: {
        total: recentRequests.length,
        avgDuration:
          recentRequests.length > 0
            ? recentRequests.reduce((sum, m) => sum + m.duration, 0) /
              recentRequests.length
            : 0,
        errorRate:
          recentRequests.length > 0
            ? recentRequests.filter((m) => m.statusCode >= 400).length /
              recentRequests.length
            : 0,
        statusCodes: this.groupByStatusCode(recentRequests),
      },
      timestamp: now,
    };
  }

  private groupByStatusCode(requests: RequestMetrics[]) {
    const grouped: Record<string, number> = {};
    requests.forEach((r) => {
      const statusRange = `${Math.floor(r.statusCode / 100)}xx`;
      grouped[statusRange] = (grouped[statusRange] || 0) + 1;
    });
    return grouped;
  }

  private flushMetrics(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.requestMetrics = this.requestMetrics.filter(
      (m) => m.timestamp > oneHourAgo
    );
  }
}

export const requestMetricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function (body) {
    const duration = Date.now() - startTime;
    const user = (req as any).user;

    MetricsCollector.getInstance().recordRequest({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userId: user?.id,
      timestamp: new Date(),
      userAgent: req.get("User-Agent"),
      ip: req.ip || req.socket.remoteAddress,
    });

    return originalSend.call(this, body);
  };

  next();
};

export const metricsCollector = MetricsCollector.getInstance();
