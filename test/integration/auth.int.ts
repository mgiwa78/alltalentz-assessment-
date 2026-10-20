import { UserRole } from "@/database/enums/trs.enums";
import { api, baseUrl, makeUser, start, stop, TestUser } from "./harness";

let estimator: TestUser;

beforeAll(async () => {
  await start();
  estimator = await makeUser(UserRole.ESTIMATOR);
});
afterAll(stop);

const login = (email: string, password: string) => api(null, "POST", "/auth/login", { email, password });

describe("auth", () => {
  it("logs in with email and password (email is case-insensitive)", async () => {
    const res = await login(estimator.user.email.toUpperCase(), estimator.password);
    expect(res.status).toBe(200);
    expect(res.body.response).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { id: estimator.user.id, role: "ESTIMATOR" },
    });
    expect(res.body.response.user).not.toHaveProperty("passwordHash");
    expect(res.body.response.user.lastLoginAt).not.toBeNull();

    const me = await api({ ...estimator, token: res.body.response.accessToken }, "GET", "/auth/me");
    expect(me.body.response.email).toBe(estimator.user.email);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await login(estimator.user.email, "wrong-password");
    const unknown = await login("nobody@test.dev", "wrong-password");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("rejects requests with no token or a bad token", async () => {
    expect((await api(null, "GET", "/jobs")).status).toBe(401);
    expect((await api({ ...estimator, token: "garbage" }, "GET", "/jobs")).status).toBe(401);
  });

  it("rotates refresh tokens and refuses to reuse one", async () => {
    const { refreshToken } = (await login(estimator.user.email, estimator.password)).body.response;
    const rotated = await api(null, "POST", "/auth/refresh", { refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.response.refreshToken).not.toBe(refreshToken);
    expect((await api(null, "POST", "/auth/refresh", { refreshToken })).status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const { refreshToken } = (await login(estimator.user.email, estimator.password)).body.response;
    expect((await api(null, "POST", "/auth/logout", { refreshToken })).status).toBe(200);
    expect((await api(null, "POST", "/auth/refresh", { refreshToken })).status).toBe(401);
  });
});

describe("platform", () => {
  it("reports health", async () => {
    const res = await api(null, "GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
  });

  it("serves the OpenAPI document", async () => {
    const res = await fetch(`${baseUrl}/api/docs.json`);
    const doc = (await res.json()) as any;
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(["/jobs", "/jobs/{id}", "/jobs/{id}/status", "/jobs/{id}/estimate", "/jobs/{id}/ai-assessment"]),
    );
  });

  it("returns the JSON error shape for unknown routes", async () => {
    const res = await api(estimator, "GET", "/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: "NOT_FOUND" });
  });
});
