import { Entity, Column, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { UserRole } from "../enums/trs.enums";

@Entity("users")
@Index("IDX_users_email", ["email"], { unique: true })
@Check("CHK_users_role", `"role" IN (${Object.values(UserRole).map((r) => `'${r}'`).join(", ")})`)
export class User extends BaseEntity {
  @Column({ type: "varchar", length: 320 })
  email!: string;

  @Column({ name: "full_name", type: "varchar", length: 120 })
  fullName!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255, select: false })
  passwordHash!: string;

  @Column({ type: "varchar", length: 32 })
  role!: UserRole;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt?: Date | null;

  @Column({ name: "sessions_revoked_at", type: "timestamptz", nullable: true })
  sessionsRevokedAt?: Date | null;
}
