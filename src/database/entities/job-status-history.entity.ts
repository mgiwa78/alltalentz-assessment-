import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { JobStatus } from "../enums/trs.enums";
import { Job } from "./job.entity";
import { User } from "./user.entity";

@Entity("job_status_history")
@Index("IDX_job_status_history_job_id_created_at", ["jobId", "createdAt"])
export class JobStatusHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "job_id", type: "varchar", length: 20 })
  jobId!: string;

  @ManyToOne(() => Job, { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job?: Job;

  @Column({ name: "from_status", type: "varchar", length: 32, nullable: true })
  fromStatus?: JobStatus | null;

  @Column({ name: "to_status", type: "varchar", length: 32 })
  toStatus!: JobStatus;

  @Column({ name: "changed_by_user_id", type: "uuid", nullable: true })
  changedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "changed_by_user_id" })
  changedBy?: User | null;

  @Column({ type: "varchar", length: 1000, nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
