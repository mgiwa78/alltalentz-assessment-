import { ConflictError, ForbiddenError } from "@/common/errors";
import { hasRole } from "@/common/middleware/role.middleware";
import { JobStatus, UserRole } from "@/database/enums/trs.enums";

const {
  NEW,
  INSPECTION,
  ESTIMATING,
  PROPOSAL_SENT,
  APPROVED,
  IN_PROGRESS,
  COMPLETED,
  CANCELLED,
} = JobStatus;

export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  [NEW]: [INSPECTION, CANCELLED],
  [INSPECTION]: [ESTIMATING, CANCELLED],
  [ESTIMATING]: [PROPOSAL_SENT, INSPECTION, CANCELLED],
  [PROPOSAL_SENT]: [APPROVED, ESTIMATING, CANCELLED],
  [APPROVED]: [IN_PROGRESS, CANCELLED],
  [IN_PROGRESS]: [COMPLETED, CANCELLED],
  [COMPLETED]: [],
  [CANCELLED]: [],
};

export const STATUS_CHANGE_ROLES: Readonly<Record<JobStatus, readonly UserRole[]>> = {
  [NEW]: [],
  [INSPECTION]: [UserRole.ESTIMATOR],
  [ESTIMATING]: [UserRole.ESTIMATOR],
  [PROPOSAL_SENT]: [UserRole.ESTIMATOR],
  [APPROVED]: [UserRole.PROJECT_MANAGER],
  [IN_PROGRESS]: [UserRole.PROJECT_MANAGER],
  [COMPLETED]: [UserRole.PROJECT_MANAGER],
  [CANCELLED]: [UserRole.PROJECT_MANAGER],
};

export const ESTIMATE_EDITABLE_STATUSES: readonly JobStatus[] = [NEW, INSPECTION, ESTIMATING];

export const isTerminalStatus = (status: JobStatus): boolean =>
  JOB_STATUS_TRANSITIONS[status].length === 0;

export const getAllowedTransitions = (from: JobStatus): readonly JobStatus[] =>
  JOB_STATUS_TRANSITIONS[from];

export const canTransition = (from: JobStatus, to: JobStatus): boolean =>
  JOB_STATUS_TRANSITIONS[from].includes(to);

export const assertStatusTransition = (
  job: { status: JobStatus; estimatedCost: number },
  to: JobStatus,
  role: UserRole,
): void => {
  const from = job.status;

  if (from === to) {
    throw new ConflictError(`Job is already ${to}`);
  }

  if (!canTransition(from, to)) {
    throw new ConflictError(
      isTerminalStatus(from)
        ? `Job is ${from}; its status can no longer change`
        : `Cannot move a job from ${from} to ${to}`,
      { from, to, allowed: getAllowedTransitions(from) },
    );
  }

  if (!hasRole(role, STATUS_CHANGE_ROLES[to])) {
    throw new ForbiddenError(
      `Role ${role} cannot move a job to ${to} (requires ${[UserRole.ADMIN, ...STATUS_CHANGE_ROLES[to]].join(" or ")})`,
    );
  }

  if (to === PROPOSAL_SENT && !(job.estimatedCost > 0)) {
    throw new ConflictError("Cannot send a proposal before the job has an estimate");
  }
};
