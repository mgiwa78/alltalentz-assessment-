import dotenv from "dotenv";

dotenv.config();

const set = (k: string, v: string) => {
  if (!process.env[k]) process.env[k] = v;
};
process.env.NODE_ENV = "test";
set("DB_HOST", "127.0.0.1");
set("DB_USERNAME", "postgres");
set("DB_PASSWORD", "postgres");
process.env.DB_NAME = process.env.TEST_DB_NAME || "trs_restoration_test";
process.env.REDIS_DRIVER = "memory";
process.env.REDIS_KEY_PREFIX = `trs-int-${process.pid}`;
process.env.JWT_PRIVATE_KEY = "";
process.env.JWT_PUBLIC_KEY = "";
process.env.LOG_LEVEL = "error";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";
process.env.ANTHROPIC_API_KEY = "";
