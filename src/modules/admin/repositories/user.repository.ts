import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { buildListFilter, RequestFilter } from "@/common/helpers/list-filter";
import { User } from "@/database/entities";
import { UserRole } from "@/database/enums/trs.enums";
import { UserRepository } from "@/modules/global/repositories/user.repository";
import { ListUsersQueryDTO } from "../validation/user.validation";

export class AdminUserRepository extends UserRepository {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(dataSource, redis);
  }

  list(filterOptions: RequestFilter, query: Pick<ListUsersQueryDTO, "role" | "isActive">) {
    return this.findPaginated({
      ...buildListFilter<User>(filterOptions, { sorts: ["createdAt", "fullName", "email", "lastLoginAt"] }),
      customize: (qb) => {
        if (query.role) qb.andWhere("user.role = :role", { role: query.role });
        if (query.isActive !== undefined) qb.andWhere("user.isActive = :isActive", { isActive: query.isActive });
      },
    });
  }

  countActiveAdmins(): Promise<number> {
    return this.count({ where: { role: UserRole.ADMIN, isActive: true } });
  }
}
