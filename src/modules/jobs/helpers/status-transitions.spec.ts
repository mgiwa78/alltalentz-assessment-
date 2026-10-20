import { ConflictError, ForbiddenError } from "@/common/errors";
import { JobStatus, UserRole } from "@/database/enums/trs.enums";
import {
  JOB_STATUS_TRANSITIONS,
  assertStatusTransition,
  canTransition,
  isTerminalStatus,
} from "./status-transitions";

const job = (status: JobStatus, estimatedCost = 4000) => ({ status, estimatedCost });

describe("job status transitions", () => {
  it("defines rules for every status", () => {
    expect(Object.keys(JOB_STATUS_TRANSITIONS).sort()).toEqual(Object.values(JobStatus).sort());
  });

  it("walks the happy path", () => {
    const path = [
      JobStatus.NEW,
      JobStatus.INSPECTION,
      JobStatus.ESTIMATING,
      JobStatus.PROPOSAL_SENT,
      JobStatus.APPROVED,
      JobStatus.IN_PROGRESS,
      JobStatus.COMPLETED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("blocks the transitions called out in the brief", () => {
    expect(canTransition(JobStatus.COMPLETED, JobStatus.ESTIMATING)).toBe(false);
    expect(canTransition(JobStatus.CANCELLED, JobStatus.IN_PROGRESS)).toBe(false);
  });

  it("makes COMPLETED and CANCELLED terminal", () => {
    expect(isTerminalStatus(JobStatus.COMPLETED)).toBe(true);
    expect(isTerminalStatus(JobStatus.CANCELLED)).toBe(true);
    expect(isTerminalStatus(JobStatus.IN_PROGRESS)).toBe(false);
  });

  it("allows cancelling any non-terminal job", () => {
    for (const status of Object.values(JobStatus).filter((s) => !isTerminalStatus(s))) {
      expect(canTransition(status, JobStatus.CANCELLED)).toBe(true);
    }
  });

  it("does not allow skipping steps", () => {
    expect(canTransition(JobStatus.NEW, JobStatus.APPROVED)).toBe(false);
    expect(canTransition(JobStatus.ESTIMATING, JobStatus.COMPLETED)).toBe(false);
  });

  describe("assertStatusTransition", () => {
    it("accepts a valid move for an allowed role", () => {
      expect(() => assertStatusTransition(job(JobStatus.NEW), JobStatus.INSPECTION, UserRole.ESTIMATOR)).not.toThrow();
      expect(() => assertStatusTransition(job(JobStatus.PROPOSAL_SENT), JobStatus.APPROVED, UserRole.PROJECT_MANAGER)).not.toThrow();
    });

    it("rejects invalid and no-op moves as conflicts", () => {
      expect(() => assertStatusTransition(job(JobStatus.COMPLETED), JobStatus.ESTIMATING, UserRole.ADMIN)).toThrow(ConflictError);
      expect(() => assertStatusTransition(job(JobStatus.NEW), JobStatus.NEW, UserRole.ADMIN)).toThrow(ConflictError);
    });

    it("enforces who owns each step", () => {
      expect(() => assertStatusTransition(job(JobStatus.PROPOSAL_SENT), JobStatus.APPROVED, UserRole.ESTIMATOR)).toThrow(ForbiddenError);
      expect(() => assertStatusTransition(job(JobStatus.NEW), JobStatus.INSPECTION, UserRole.PROJECT_MANAGER)).toThrow(ForbiddenError);
      expect(() => assertStatusTransition(job(JobStatus.NEW), JobStatus.INSPECTION, UserRole.ADMIN)).not.toThrow();
    });

    it("requires an estimate before a proposal is sent", () => {
      expect(() => assertStatusTransition(job(JobStatus.ESTIMATING, 0), JobStatus.PROPOSAL_SENT, UserRole.ESTIMATOR)).toThrow(
        "Cannot send a proposal before the job has an estimate",
      );
    });
  });
});
