import { DataSource } from "typeorm";
import { BaseRepository } from "@/repository/base.repository";
import { RedisClient } from "@/common";
import { AuditLog } from "@/database/entities";
import { buildListFilter, RequestFilter } from "@/common/helpers/list-filter";
import { ListAuditLogsQueryDTO } from "../validation/audit-log.validation";

export class AuditLogRepository extends BaseRepository<AuditLog> {
  protected cacheEnabled = false;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(AuditLog, dataSource, redis);
  }

  protected getAlias(): string {
    return "audit";
  }

  list(filterOptions: RequestFilter, query: ListAuditLogsQueryDTO) {
    return this.findPaginated({
      ...buildListFilter<AuditLog>(filterOptions, { sorts: ["createdAt"] }),
      customize: (qb) => {
        if (query.action) qb.andWhere("audit.action ILIKE :action", { action: `%${query.action}%` });
        if (query.resourceType) qb.andWhere("audit.resourceType = :resourceType", { resourceType: query.resourceType });
        if (query.resourceId) qb.andWhere("audit.resourceId = :resourceId", { resourceId: query.resourceId });
        if (query.userId) qb.andWhere("audit.userId = :userId", { userId: query.userId });
        if (query.from) qb.andWhere("audit.createdAt >= :from", { from: query.from });
        if (query.to) qb.andWhere("audit.createdAt <= :to", { to: query.to });
      },
    });
  }
}
