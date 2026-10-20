import { UserRole } from "@/database/enums/trs.enums";
import { api, createJob, makeUser, moveTo, start, stop, TestUser } from "./harness";

let admin: TestUser, estimator: TestUser, pm: TestUser;

beforeAll(async () => {
  await start();
  admin = await makeUser(UserRole.ADMIN);
  estimator = await makeUser(UserRole.ESTIMATOR);
  pm = await makeUser(UserRole.PROJECT_MANAGER);
});
afterAll(stop);

describe("admin gate", () => {
  it("is ADMIN only", async () => {
    expect((await api(estimator, "GET", "/admin/users")).status).toBe(403);
    expect((await api(pm, "GET", "/admin/audit-logs")).status).toBe(403);
    expect((await api(null, "GET", "/admin/users")).status).toBe(401);
    expect((await api(admin, "GET", "/admin/users")).status).toBe(200);
  });
});

describe("user management", () => {
  it("creates a user who can then log in", async () => {
    const created = await api(admin, "POST", "/admin/users", {
      email: "New.Estimator@test.dev",
      fullName: "New Estimator",
      password: "a-long-password",
      role: "ESTIMATOR",
    });
    expect(created.status).toBe(201);
    expect(created.body.response).toMatchObject({ email: "new.estimator@test.dev", role: "ESTIMATOR", isActive: true });

    const login = await api(null, "POST", "/auth/login", { email: "new.estimator@test.dev", password: "a-long-password" });
    expect(login.status).toBe(200);

    const duplicate = await api(admin, "POST", "/admin/users", {
      email: "new.estimator@test.dev",
      fullName: "Again",
      password: "a-long-password",
      role: "ESTIMATOR",
    });
    expect(duplicate.status).toBe(409);
  });

  it("deactivating a user revokes their existing tokens", async () => {
    const victim = await makeUser(UserRole.ESTIMATOR);
    expect((await api(victim, "GET", "/jobs")).status).toBe(200);
    expect((await api(admin, "PATCH", `/admin/users/${victim.user.id}`, { isActive: false })).status).toBe(200);
    expect((await api(victim, "GET", "/jobs")).status).toBe(401);
    expect((await api(null, "POST", "/auth/login", { email: victim.user.email, password: victim.password })).status).toBe(401);
  });

  it("stops an admin from locking themselves out", async () => {
    expect((await api(admin, "PATCH", `/admin/users/${admin.user.id}`, { isActive: false })).status).toBe(400);
    expect((await api(admin, "PATCH", `/admin/users/${admin.user.id}`, { role: "ESTIMATOR" })).status).toBe(400);
  });

  it("filters users by role", async () => {
    const res = await api(admin, "GET", "/admin/users?role=PROJECT_MANAGER");
    expect(res.body.response.data.every((u: any) => u.role === "PROJECT_MANAGER")).toBe(true);
    expect(res.body.response.data.length).toBeGreaterThan(0);
  });
});

describe("audit log", () => {
  it("records job creation, status changes and estimates", async () => {
    const job = await createJob(estimator);
    await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 1, materialCost: 2, equipmentCost: 3 });
    await moveTo(estimator, job.id, "INSPECTION");

    const res = await api(admin, "GET", `/admin/audit-logs?resourceType=job&resourceId=${job.id}&limit=50`);
    const actions = res.body.response.data.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["job.created", "job.estimated", "job.status_changed"]));

    const change = res.body.response.data.find((l: any) => l.action === "job.status_changed");
    expect(change).toMatchObject({ userId: estimator.user.id, metadata: { from: "NEW", to: "INSPECTION" } });
  });
});
