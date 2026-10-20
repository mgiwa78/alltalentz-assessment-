import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("audit_logs")
@Index(["userId"])
@Index(["action"])
@Index(["createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: true, type: "varchar" })
  userId?: string;

  @Column({ type: "varchar" })
  action!: string;

  @Column({ type: "varchar" })
  resourceType!: string;

  @Column({ nullable: true, type: "varchar" })
  resourceId?: string;

  @Column({ nullable: true, type: "jsonb" })
  oldValues?: Record<string, unknown>;

  @Column({ nullable: true, type: "jsonb" })
  newValues?: Record<string, unknown>;

  @Column({ nullable: true, type: "varchar" })
  ipAddress?: string;

  @Column({ nullable: true, type: "varchar" })
  userAgent?: string;

  @Column({ nullable: true, type: "jsonb" })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
