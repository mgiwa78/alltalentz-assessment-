import "reflect-metadata";
import http from "http";
import { AddressInfo } from "net";
import { AppDataSource } from "@/config/data-source";
import { jwt, redis } from "@/config/int-services";
import { createApp } from "@/app";
import { User } from "@/database/entities";
import { UserRole } from "@/database/enums/trs.enums";
import { hashPassword } from "@/common/helpers/password";
import { setDamageAssessmentProvider } from "@/core/ai";

export interface TestUser {
  user: User;
  token: string;
  password: string;
}

let server: http.Server;
export let baseUrl = "";
let seq = 0;

export const start = async () => {
  setDamageAssessmentProvider(undefined);
  AppDataSource.setOptions({ dropSchema: true, synchronize: false, migrationsRun: true });
  await AppDataSource.initialize();

  server = http.createServer(createApp(AppDataSource, { httpLogging: false }));
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

export const stop = async () => {
  setDamageAssessmentProvider(undefined);
  if (server?.listening) await new Promise<void>((r) => server.close(() => r()));
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  await redis.redis.flushdb().catch(() => undefined);
  redis.redis.disconnect();
};

export const makeUser = async (role: UserRole = UserRole.ESTIMATOR): Promise<TestUser> => {
  const n = ++seq;
  const password = `Password-${n}-test`;
  const repo = AppDataSource.getRepository(User);
  const user = await repo.save(
    repo.create({
      email: `user${n}-${Date.now()}@test.dev`,
      fullName: `Test ${role} ${n}`,
      role,
      passwordHash: await hashPassword(password),
      isActive: true,
    }),
  );
  return { user, password, token: jwt.sign({ userId: user.id }, "15m") };
};

export const api = async (
  who: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> => {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(who ? { authorization: `Bearer ${who.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

export const rawRequest = async (
  method: string,
  path: string,
  rawBody: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

export const validJob = {
  customerName: "John Smith",
  customerEmail: "john@example.com",
  propertyAddress: "123 Main Street",
  damageType: "WATER",
  damageDescription: "Water damage affecting the kitchen ceiling and wall.",
  squareFeet: 450,
};

export const createJob = async (who: TestUser, overrides: Record<string, unknown> = {}) => {
  const res = await api(who, "POST", "/jobs", { ...validJob, ...overrides });
  if (res.status !== 201) throw new Error(`createJob failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.response;
};

export const moveTo = async (who: TestUser, jobId: string, ...statuses: string[]) => {
  let last: { status: number; body: any } | undefined;
  for (const status of statuses) {
    last = await api(who, "PATCH", `/jobs/${jobId}/status`, { status });
    if (last.status !== 200) throw new Error(`moveTo ${status} failed: ${last.status} ${JSON.stringify(last.body)}`);
  }
  return last!;
};
