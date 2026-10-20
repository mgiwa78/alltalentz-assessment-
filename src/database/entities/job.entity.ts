import {
  Entity,
  Column,
  Index,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ValueTransformer,
  ManyToOne,
  JoinColumn,
  Check,
} from "typeorm";
import { User } from "./user.entity";
import { DamageType, JobStatus } from "../enums/trs.enums";

const sqlList = (values: object) => Object.values(values).map((v) => `'${v}'`).join(", ");

const money: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? null : Number(value)),
};

@Entity("jobs")
@Index("IDX_jobs_job_number", ["jobNumber"], { unique: true })
@Index("IDX_jobs_status", ["status"])
@Index("IDX_jobs_damage_type", ["damageType"])
@Index("IDX_jobs_created_at", ["createdAt"])
@Check("CHK_jobs_status", `"status" IN (${sqlList(JobStatus)})`)
@Check("CHK_jobs_damage_type", `"damage_type" IN (${sqlList(DamageType)})`)
@Check("CHK_jobs_square_feet", `"square_feet" > 0`)
@Check("CHK_jobs_costs", `"estimated_cost" >= 0 AND COALESCE("labor_cost", 0) >= 0 AND COALESCE("material_cost", 0) >= 0 AND COALESCE("equipment_cost", 0) >= 0`)
export class Job {
  @PrimaryColumn({ type: "varchar", length: 20 })
  id!: string;

  @Column({ name: "job_number", type: "int" })
  jobNumber!: number;

  @Column({ name: "customer_name", type: "varchar", length: 120 })
  customerName!: string;

  @Column({ name: "customer_email", type: "varchar", length: 320 })
  customerEmail!: string;

  @Column({ name: "property_address", type: "varchar", length: 300 })
  propertyAddress!: string;

  @Column({ name: "damage_type", type: "varchar", length: 16 })
  damageType!: DamageType;

  @Column({ name: "damage_description", type: "text" })
  damageDescription!: string;

  @Column({ name: "square_feet", type: "int" })
  squareFeet!: number;

  @Column({ type: "varchar", length: 32, default: JobStatus.NEW })
  status!: JobStatus;

  @Column({ name: "estimated_cost", type: "numeric", precision: 12, scale: 2, default: 0, transformer: money })
  estimatedCost!: number;

  @Column({ name: "labor_cost", type: "numeric", precision: 12, scale: 2, nullable: true, transformer: money })
  laborCost?: number | null;

  @Column({ name: "material_cost", type: "numeric", precision: 12, scale: 2, nullable: true, transformer: money })
  materialCost?: number | null;

  @Column({ name: "equipment_cost", type: "numeric", precision: 12, scale: 2, nullable: true, transformer: money })
  equipmentCost?: number | null;

  @Column({ name: "estimated_at", type: "timestamptz", nullable: true })
  estimatedAt?: Date | null;

  @Column({ name: "estimated_by_user_id", type: "uuid", nullable: true })
  estimatedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "estimated_by_user_id" })
  estimatedBy?: User | null;

  @Column({ name: "created_by_user_id", type: "uuid", nullable: true })
  createdByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_user_id" })
  createdBy?: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
