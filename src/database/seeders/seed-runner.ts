import "reflect-metadata";
import { DataSource } from "typeorm";
import { AppDataSource } from "@/config/data-source";
import { Logger } from "@/common/logger";
import { UserSeeder } from "./user.seeder";
import { JobSeeder } from "./job.seeder";

interface Seeder {
  run(dataSource: DataSource): Promise<void>;
}

const ESSENTIAL: [string, Seeder][] = [["staff accounts", new UserSeeder()]];

const SAMPLE: [string, Seeder][] = [["sample jobs and status history", new JobSeeder()]];

export async function runSeeders(dataSource: DataSource, { sample }: { sample: boolean }, log: (m: string) => void = () => undefined) {
  for (const [label, seeder] of [...ESSENTIAL, ...(sample ? SAMPLE : [])]) {
    log(`Seeding ${label}`);
    await seeder.run(dataSource);
  }
}

async function main() {
  const logger = new Logger({ level: "info", service: "seed-runner" });
  const isProduction = process.env.NODE_ENV === "production";
  const reset = process.env.SEED_RESET === undefined ? !isProduction : process.env.SEED_RESET === "true";
  const sample = reset || process.env.SEED_SAMPLE_DATA === "true";

  try {
    await AppDataSource.initialize();

    if (reset) {
      logger.warn("SEED_RESET: dropping schema and rebuilding it from migrations");
      await AppDataSource.dropDatabase();
      await AppDataSource.runMigrations();
    }

    await runSeeders(AppDataSource, { sample }, (m) => logger.info(m));
    logger.info(sample ? "Seeding completed (staff + sample jobs)" : "Staff accounts seeded (no sample data)");
    process.exitCode = 0;
  } catch (err) {
    logger.error("Seeding failed:", err as Error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

if (require.main === module) void main();
