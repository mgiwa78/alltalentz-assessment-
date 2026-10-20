import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { RequestFilter } from "@/common/helpers/list-filter";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ListAuditLogsQueryDTO } from "../validation/audit-log.validation";

export class AuditLogService {
  private auditLogRepository: AuditLogRepository;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    this.auditLogRepository = new AuditLogRepository(dataSource, redis);
  }

  listAuditLogs = (query: ListAuditLogsQueryDTO, filter: RequestFilter) =>
    this.auditLogRepository.list(filter, query);
}
