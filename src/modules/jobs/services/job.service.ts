import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { ConflictError, NotFoundError } from "@/common/errors";
import { RequestFilter, mapPaginated } from "@/common/helpers/list-filter";
import { recordAction } from "@/common/monitoring/audit";
import { Job, User } from "@/database/entities";
import { JobStatus } from "@/database/enums/trs.enums";
import { JobRepository, JobResponse } from "../repositories/job.repository";
import { JobStatusHistoryRepository } from "../repositories/job-status-history.repository";
import { ESTIMATE_EDITABLE_STATUSES, assertStatusTransition } from "../helpers/status-transitions";
import { calculateEstimatedCost, formatJobId } from "../helpers/estimate";
import {
  CreateJobDTO,
  EstimateJobDTO,
  ListJobsQueryDTO,
  UpdateJobStatusDTO,
} from "../validation/job.validation";

export class JobService {
  private jobRepository: JobRepository;
  private historyRepository: JobStatusHistoryRepository;

  constructor(
    private dataSource: DataSource,
    redis?: RedisClient,
  ) {
    this.jobRepository = new JobRepository(dataSource, redis);
    this.historyRepository = new JobStatusHistoryRepository(dataSource, redis);
  }

  getJob = async (id: string): Promise<Job> => {
    const job = await this.jobRepository.findById(id);
    if (!job) throw new NotFoundError("Job not found");
    return job;
  };

  getJobDetail = async (id: string): Promise<JobResponse> =>
    this.jobRepository.formatEntityForResponse(await this.getJob(id));

  listJobs = async (query: ListJobsQueryDTO, filter: RequestFilter) => {
    const result = await this.jobRepository.list(filter, query);
    return mapPaginated(result, (job) => this.jobRepository.formatEntityForResponse(job));
  };

  createJob = async (actor: User, dto: CreateJobDTO): Promise<JobResponse> => {
    const created = await this.dataSource.transaction(async (manager) => {
      const jobNumber = await this.jobRepository.allocateJobNumber(manager);
      const job = await manager.save(
        manager.create(Job, {
          ...dto,
          id: formatJobId(jobNumber),
          jobNumber,
          status: JobStatus.NEW,
          estimatedCost: 0,
          createdByUserId: actor.id,
        }),
      );
      await this.historyRepository.record(manager, {
        jobId: job.id,
        fromStatus: null,
        toStatus: JobStatus.NEW,
        changedByUserId: actor.id,
        note: "Job created",
      });
      return job;
    });

    recordAction("job.created", actor.id, "job", created.id, { damageType: created.damageType });
    return this.getJobDetail(created.id);
  };

  updateStatus = async (actor: User, dto: UpdateJobStatusDTO): Promise<JobResponse> => {
    const { from, to } = await this.dataSource.transaction(async (manager) => {
      const job = await this.jobRepository.findForUpdate(manager, dto.id);
      if (!job) throw new NotFoundError("Job not found");

      const fromStatus = job.status;
      assertStatusTransition(job, dto.status, actor.role);

      job.status = dto.status;
      await manager.save(job);
      await this.historyRepository.record(manager, {
        jobId: job.id,
        fromStatus,
        toStatus: dto.status,
        changedByUserId: actor.id,
        note: dto.note,
      });
      return { from: fromStatus, to: dto.status };
    });

    await this.jobRepository.invalidateCache();
    recordAction("job.status_changed", actor.id, "job", dto.id, { from, to });
    return this.getJobDetail(dto.id);
  };

  submitEstimate = async (actor: User, dto: EstimateJobDTO): Promise<JobResponse> => {
    const { previous, estimatedCost } = await this.dataSource.transaction(async (manager) => {
      const job = await this.jobRepository.findForUpdate(manager, dto.id);
      if (!job) throw new NotFoundError("Job not found");

      if (!ESTIMATE_EDITABLE_STATUSES.includes(job.status)) {
        throw new ConflictError(
          `Estimates can only be changed while a job is ${ESTIMATE_EDITABLE_STATUSES.join(", ")} (this job is ${job.status})`,
        );
      }

      const previousCost = Number(job.estimatedCost ?? 0);
      job.laborCost = dto.laborCost;
      job.materialCost = dto.materialCost;
      job.equipmentCost = dto.equipmentCost;
      job.estimatedCost = calculateEstimatedCost(dto);
      job.estimatedAt = new Date();
      job.estimatedByUserId = actor.id;
      await manager.save(job);
      return { previous: previousCost, estimatedCost: job.estimatedCost };
    });

    await this.jobRepository.invalidateCache();
    recordAction("job.estimated", actor.id, "job", dto.id, {
      previousEstimatedCost: previous,
      estimatedCost,
      laborCost: dto.laborCost,
      materialCost: dto.materialCost,
      equipmentCost: dto.equipmentCost,
    });
    return this.getJobDetail(dto.id);
  };

  getStatusHistory = async (id: string) => {
    await this.getJob(id);
    const rows = await this.historyRepository.findForJob(id);
    return rows.map((row) => ({
      fromStatus: row.fromStatus ?? null,
      toStatus: row.toStatus,
      changedByUserId: row.changedByUserId ?? null,
      note: row.note ?? null,
      changedAt: row.createdAt,
    }));
  };
}
