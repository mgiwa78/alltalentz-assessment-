import { DataSource } from "typeorm";
import { BaseRepository } from "@/repository/base.repository";
import { RedisClient } from "@/common";
import { User } from "@/database/entities";

export class UserRepository extends BaseRepository<User> {
  protected auditEnabled = true;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(User, dataSource, redis);
  }

  protected getAlias(): string {
    return "user";
  }

  protected getSearchFields(): string[] {
    return ["fullName", "email"];
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.email = :email", { email: email.trim().toLowerCase() })
      .getOne();
  }

  public formatEntityForResponse(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export type PublicUser = ReturnType<UserRepository["formatEntityForResponse"]>;
