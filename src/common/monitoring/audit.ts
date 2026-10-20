import { DataSource } from "typeorm";
import { AuditLog } from "@/database/entities/audit-log.entity";
import { Logger } from "../logger";
import {
  requestContextStorage,
  RequestContext,
} from "../context/request-context";

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private logger: Logger;
  private pendingLogs: AuditLogEntry[] = [];

  private constructor(private dataSource: DataSource) {
    this.logger = new Logger({ level: "info", service: "audit-logger" });

    setInterval(() => {
      this.flushLogs();
    }, 30000).unref();
  }

  static initialize(dataSource: DataSource): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger(dataSource);
    }
    return AuditLogger.instance;
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      throw new Error("AuditLogger must be initialized first");
    }
    return AuditLogger.instance;
  }

  async log(entry: Omit<AuditLogEntry, "timestamp">): Promise<void> {
    const auditEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.pendingLogs.push(auditEntry);

    this.logger.info("Audit event", {
      userId: auditEntry.userId,
      action: auditEntry.action,
      resourceType: auditEntry.resourceType,
      resourceId: auditEntry.resourceId,
      timestamp: auditEntry.timestamp,
    });

    if (this.pendingLogs.length >= 100) {
      await this.flushLogs();
    }
  }

  async logAuth(
    action: "login" | "login_failed" | "logout" | "token_refreshed",
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      action: `auth.${action}`,
      resourceType: "user",
      resourceId: userId,
      metadata,
    });
  }

  async logCrud(
    action: "create" | "update" | "delete",
    resourceType: string,
    resourceId: string,
    userId?: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      action: `${resourceType}.${action}`,
      resourceType,
      resourceId,
      oldValues,
      newValues,
    });
  }

  async logAction(
    action: string,
    actorUserId: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const ctx = requestContextStorage.getStore();
    await this.log({
      userId: actorUserId,
      action,
      resourceType,
      resourceId,
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
      metadata,
    });
    await this.flushLogs();
  }

  async logSecurity(
    event: string,
    userId?: string,
    severity: "low" | "medium" | "high" | "critical" = "medium",
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      userId,
      action: `security.${event}`,
      resourceType: "security",
      metadata: {
        severity,
        ...metadata,
      },
    });

    if (severity === "high" || severity === "critical") {
      this.logger.warn("Security event", { event, severity, userId, metadata });
      await this.flushLogs();
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.pendingLogs.length === 0) return;

    const logsToFlush = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      const repo = this.dataSource.getRepository(AuditLog);
      const rows = logsToFlush.map((log) =>
        repo.create({
          userId: log.userId,
          action: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          oldValues: log.oldValues,
          newValues: log.newValues,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          metadata: log.metadata,
          createdAt: log.timestamp,
        }),
      );
      await repo.save(rows);
      this.logger.debug(`Flushed ${logsToFlush.length} audit logs`);
    } catch (error: any) {
      this.logger.error("Failed to flush audit logs", undefined, {
        error: error instanceof Error ? error.message : String(error),
        logCount: logsToFlush.length,
      });
      this.pendingLogs = [...logsToFlush.slice(-50), ...this.pendingLogs];
    }
  }

  async queryAuditLogs(params: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    const repo = this.dataSource.getRepository(AuditLog);
    const qb = repo.createQueryBuilder("al").orderBy("al.createdAt", "DESC");

    if (params.userId)
      qb.andWhere("al.userId = :userId", { userId: params.userId });
    if (params.action)
      qb.andWhere("al.action ILIKE :action", { action: `%${params.action}%` });
    if (params.resourceType)
      qb.andWhere("al.resourceType = :resourceType", {
        resourceType: params.resourceType,
      });
    if (params.resourceId)
      qb.andWhere("al.resourceId = :resourceId", {
        resourceId: params.resourceId,
      });
    if (params.startDate)
      qb.andWhere("al.createdAt >= :startDate", {
        startDate: params.startDate,
      });
    if (params.endDate)
      qb.andWhere("al.createdAt <= :endDate", { endDate: params.endDate });

    qb.limit(params.limit ?? 100).offset(params.offset ?? 0);
    return qb.getMany();
  }
}

export const auditMiddleware = (req: any, _res: any, next: any) => {
  const ctx: RequestContext = {
    ipAddress: req.ip || req.socket?.remoteAddress,
    userAgent: req.get?.("User-Agent"),
    requestId: req.requestId,
  };

  requestContextStorage.run(ctx, () => next());
};

export const auditLogger = AuditLogger.getInstance;

export const recordAction = (
  action: string,
  actorUserId: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, any>,
): void => {
  try {
    AuditLogger.getInstance()
      .logAction(action, actorUserId, resourceType, resourceId, metadata)
      .catch(() => undefined);
  } catch {
    return;
  }
};
