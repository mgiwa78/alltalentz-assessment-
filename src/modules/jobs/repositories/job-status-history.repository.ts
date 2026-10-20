import { DataSource, EntityManager } from "typeorm";
import { BaseRepository } from "@/repository/base.repository";
import { RedisClient } from "@/common";
import { JobStatusHistory } from "@/database/entities";
import { JobStatus } from "@/database/enums/trs.enums";

export interface StatusChange {
  jobId: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedByUserId: string;
  note?: string | null;
}

export class JobStatusHistoryRepository extends BaseRepository<JobStatusHistory> {
  protected cacheEnabled = false;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(JobStatusHistory, dataSource, redis);
  }

  protected getAlias(): string {
    return "history";
  }

  record(manager: EntityManager, change: StatusChange): Promise<JobStatusHistory> {
    return manager.save(manager.create(JobStatusHistory, { ...change, note: change.note ?? null }));
  }

  findForJob(jobId: string): Promise<JobStatusHistory[]> {
    return this.find({ where: { jobId }, order: { createdAt: "ASC" } });
  }
}
