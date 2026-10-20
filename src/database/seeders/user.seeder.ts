import { DataSource } from "typeorm";
import { User } from "@/database/entities";
import { UserRole } from "@/database/enums/trs.enums";
import { hashPassword } from "@/common/helpers/password";
import { UserRepository } from "@/modules/global/repositories/user.repository";

export const DEFAULT_SEED_PASSWORD = "Password123!";

export const STAFF_ACCOUNTS: { email: string; fullName: string; role: UserRole }[] = [
  { email: "admin@trs.test", fullName: "Ada Admin", role: UserRole.ADMIN },
  { email: "estimator@trs.test", fullName: "Evan Estimator", role: UserRole.ESTIMATOR },
  { email: "estimator2@trs.test", fullName: "Erin Estimator", role: UserRole.ESTIMATOR },
  { email: "pm@trs.test", fullName: "Paula Manager", role: UserRole.PROJECT_MANAGER },
];

export class UserSeeder {
  constructor(private readonly password: string = process.env.SEED_USER_PASSWORD || DEFAULT_SEED_PASSWORD) {}

  public async run(dataSource: DataSource): Promise<void> {
    const users = new UserRepository(dataSource);
    const repo = dataSource.getRepository(User);
    const passwordHash = await hashPassword(this.password);

    for (const account of STAFF_ACCOUNTS) {
      if (await users.findByEmail(account.email)) continue;
      await repo.save(repo.create({ ...account, passwordHash, isActive: true }));
    }
  }
}

export const seededStaff = async (dataSource: DataSource, role?: UserRole): Promise<User[]> => {
  const repo = dataSource.getRepository(User);
  const all = await repo.find({ order: { email: "ASC" } });
  return all.filter((u) => STAFF_ACCOUNTS.some((a) => a.email === u.email) && (!role || u.role === role));
};
