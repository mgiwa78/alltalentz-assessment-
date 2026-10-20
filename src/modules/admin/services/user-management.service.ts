import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BadRequestError, ConflictError, NotFoundError } from "@/common/errors";
import { hashPassword } from "@/common/helpers";
import { RequestFilter, mapPaginated } from "@/common/helpers/list-filter";
import { recordAction } from "@/common/monitoring/audit";
import { User } from "@/database/entities";
import { UserRole } from "@/database/enums/trs.enums";
import { AdminUserRepository } from "../repositories/user.repository";
import { CreateUserDTO, ListUsersQueryDTO, UpdateUserDTO } from "../validation/user.validation";

export class UserManagementService {
  private userRepository: AdminUserRepository;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    this.userRepository = new AdminUserRepository(dataSource, redis);
  }

  listUsers = async (query: ListUsersQueryDTO, filter: RequestFilter) => {
    const result = await this.userRepository.list(filter, query);
    return mapPaginated(result, (user) => this.userRepository.formatEntityForResponse(user));
  };

  getUser = async (userId: string): Promise<User> => {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    return user;
  };

  createUser = async (actor: User, dto: CreateUserDTO) => {
    if (await this.userRepository.findByEmail(dto.email)) {
      throw new ConflictError("A user with this email already exists");
    }

    const user = await this.userRepository.save(
      this.userRepository.create({
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await hashPassword(dto.password),
        isActive: true,
      }),
    );

    recordAction("user.created", actor.id, "user", user.id, { role: user.role });
    return this.userRepository.formatEntityForResponse(await this.getUser(user.id));
  };

  updateUser = async (actor: User, dto: UpdateUserDTO) => {
    const user = await this.getUser(dto.userId);
    const isSelf = user.id === actor.id;

    if (isSelf && (dto.isActive === false || (dto.role && dto.role !== UserRole.ADMIN))) {
      throw new BadRequestError("You cannot deactivate or demote your own account");
    }

    const losingAdmin =
      user.role === UserRole.ADMIN && user.isActive &&
      ((dto.role && dto.role !== UserRole.ADMIN) || dto.isActive === false);
    if (losingAdmin && (await this.userRepository.countActiveAdmins()) <= 1) {
      throw new ConflictError("At least one active ADMIN must remain");
    }

    const changes: Partial<User> = {};
    if (dto.fullName !== undefined) changes.fullName = dto.fullName;
    if (dto.role !== undefined) changes.role = dto.role;
    if (dto.isActive !== undefined) changes.isActive = dto.isActive;
    if ((dto.role !== undefined && dto.role !== user.role) || dto.isActive === false) {
      changes.sessionsRevokedAt = new Date();
    }

    await this.userRepository.update(user.id, changes);
    recordAction("user.updated", actor.id, "user", user.id, {
      ...(dto.role !== undefined ? { role: { from: user.role, to: dto.role } } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    return this.userRepository.formatEntityForResponse(await this.getUser(user.id));
  };
}
