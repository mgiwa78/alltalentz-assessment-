import { DataSource, EntityManager } from "typeorm";
import { BaseRepository } from "@/repository/base.repository";
import { RedisClient } from "@/common";
import { Job } from "@/database/entities";
import { buildListFilter, RequestFilter } from "@/common/helpers/list-filter";
import { ListJobsQueryDTO } from "../validation/job.validation";
import { getAllowedTransitions } from "../helpers/status-transitions";

export class JobRepository extends BaseRepository<Job> {
  protected auditEnabled = true;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Job, dataSource, redis);
  }

  protected getAlias(): string {
    return "job";
  }

  protected getSearchFields(): string[] {
    return ["customerName", "customerEmail", "propertyAddress"];
  }

  list(filterOptions: RequestFilter, query: Pick<ListJobsQueryDTO, "status" | "damageType">) {
    return this.findPaginated({
      ...buildListFilter<Job>(filterOptions, {
        sorts: ["createdAt", "updatedAt", "estimatedCost", "jobNumber", "squareFeet"],
      }),
      customize: (qb) => {
        if (query.status) qb.andWhere("job.status = :status", { status: query.status });
        if (query.damageType) qb.andWhere("job.damageType = :damageType", { damageType: query.damageType });
      },
    });
  }

  async allocateJobNumber(manager: EntityManager): Promise<number> {
    await manager.query("SELECT pg_advisory_xact_lock(hashtext('jobs.job_number'))");
    const [row] = await manager.query("SELECT COALESCE(MAX(job_number), 0) AS max FROM jobs");
    return Number(row.max) + 1;
  }

  findForUpdate(manager: EntityManager, id: string): Promise<Job | null> {
    return manager.findOne(Job, { where: { id }, lock: { mode: "pessimistic_write" } });
  }

  public formatEntityForResponse(job: Job) {
    const estimated = job.estimatedAt != null;
    return {
      id: job.id,
      customerName: job.customerName,
      customerEmail: job.customerEmail,
      propertyAddress: job.propertyAddress,
      damageType: job.damageType,
      damageDescription: job.damageDescription,
      squareFeet: job.squareFeet,
      status: job.status,
      estimatedCost: Number(job.estimatedCost ?? 0),
      estimate: estimated
        ? {
            laborCost: job.laborCost,
            materialCost: job.materialCost,
            equipmentCost: job.equipmentCost,
            estimatedAt: job.estimatedAt,
            estimatedByUserId: job.estimatedByUserId ?? null,
          }
        : null,
      allowedTransitions: getAllowedTransitions(job.status),
      createdByUserId: job.createdByUserId ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}

export type JobResponse = ReturnType<JobRepository["formatEntityForResponse"]>;
