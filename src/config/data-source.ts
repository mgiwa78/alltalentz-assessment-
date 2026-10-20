import "reflect-metadata";
import path from "path";
import { DataSource } from "typeorm";
import { Config } from "./index";
import { User, AuditLog, Job, JobStatusHistory } from "@/database/entities";

const runningCompiled = __filename.replace(/\\/g, "/").includes("/dist/");

export const AppDataSource = new DataSource({
  type: "postgres",
  host: Config.database.host,
  port: Config.database.port,
  username: Config.database.username,
  password: Config.database.password,
  database: Config.database.name,
  synchronize: false,
  uuidExtension: "pgcrypto",
  logging: false,
  ssl: Config.database.ssl,
  extra: {
    connectionTimeoutMillis: 8000,
    max: 20,
    idleTimeoutMillis: 30000,
    ...(Config.database.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  },
  entities: [User, AuditLog, Job, JobStatusHistory],
  migrations: [
    runningCompiled
      ? path.join(__dirname, "..", "database", "migrations", "**", "*.js")
      : "src/database/migrations/**/*.ts",
  ],
  subscribers: [],
});
