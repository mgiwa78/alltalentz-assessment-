import { UserRole } from "@/database/enums/trs.enums";
import { api, createJob, makeUser, moveTo, rawRequest, start, stop, TestUser, validJob } from "./harness";

let admin: TestUser, estimator: TestUser, pm: TestUser;

beforeAll(async () => {
  await start();
  admin = await makeUser(UserRole.ADMIN);
  estimator = await makeUser(UserRole.ESTIMATOR);
  pm = await makeUser(UserRole.PROJECT_MANAGER);
});
afterAll(stop);

describe("POST /jobs", () => {
  it("creates a job with a JOB-### id, status NEW and estimatedCost 0", async () => {
    const res = await api(estimator, "POST", "/jobs", validJob);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.response).toMatchObject({
      ...validJob,
      status: "NEW",
      estimatedCost: 0,
      estimate: null,
      allowedTransitions: ["INSPECTION", "CANCELLED"],
      createdByUserId: estimator.user.id,
    });
    expect(res.body.response.id).toMatch(/^JOB-\d{3,}$/);
    expect(Date.parse(res.body.response.createdAt)).not.toBeNaN();
  });

  it("ignores status / estimatedCost / id sent by the client", async () => {
    const res = await api(estimator, "POST", "/jobs", { ...validJob, status: "APPROVED", estimatedCost: 99999, id: "JOB-999" });
    expect(res.status).toBe(201);
    expect(res.body.response.status).toBe("NEW");
    expect(res.body.response.estimatedCost).toBe(0);
    expect(res.body.response.id).not.toBe("JOB-999");
  });

  it("rejects missing required fields with a 400 and per-field details", async () => {
    const res = await api(estimator, "POST", "/jobs", { customerName: "Only A Name" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: "Validation failed", code: "VALIDATION_ERROR" });
    const paths = res.body.details.map((d: any) => d.path);
    expect(paths).toEqual(
      expect.arrayContaining(["customerEmail", "propertyAddress", "damageType", "damageDescription", "squareFeet"]),
    );
  });

  it("rejects an invalid damage type", async () => {
    const res = await api(estimator, "POST", "/jobs", { ...validJob, damageType: "EARTHQUAKE" });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      { path: "damageType", message: "damageType must be one of: WATER, FIRE, MOLD, STORM, OTHER" },
    ]);
  });

  it("rejects an invalid email and invalid squareFeet", async () => {
    expect((await api(estimator, "POST", "/jobs", { ...validJob, customerEmail: "nope" })).status).toBe(400);
    expect((await api(estimator, "POST", "/jobs", { ...validJob, squareFeet: -5 })).status).toBe(400);
    expect((await api(estimator, "POST", "/jobs", { ...validJob, squareFeet: "450" })).status).toBe(400);
  });

  it("rejects malformed JSON with the standard error shape", async () => {
    const res = await rawRequest("POST", "/api/v1/jobs", "{ not json", { authorization: `Bearer ${estimator.token}` });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: "MALFORMED_JSON" });
  });

  it("requires authentication and an estimator or admin role", async () => {
    expect((await api(null, "POST", "/jobs", validJob)).status).toBe(401);
    expect((await api(pm, "POST", "/jobs", validJob)).status).toBe(403);
    expect((await api(admin, "POST", "/jobs", validJob)).status).toBe(201);
  });

  it("hands out unique, sequential ids under concurrent creation", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => api(estimator, "POST", "/jobs", validJob)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => Number(r.body.response.id.slice(4))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(8);
    expect(numbers[7] - numbers[0]).toBe(7);
  });
});

describe("GET /jobs/:id", () => {
  it("returns an existing job", async () => {
    const job = await createJob(estimator);
    const res = await api(pm, "GET", `/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body.response).toEqual(job);
  });

  it("accepts the id in any case", async () => {
    const job = await createJob(estimator);
    expect((await api(pm, "GET", `/jobs/${job.id.toLowerCase()}`)).body.response.id).toBe(job.id);
  });

  it("returns 404 with the standard error body for an unknown job", async () => {
    const res = await api(pm, "GET", "/jobs/JOB-99999");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: "Job not found", code: "NOT_FOUND" });
  });

  it("returns 400 for a malformed id", async () => {
    expect((await api(pm, "GET", "/jobs/not-a-job")).status).toBe(400);
  });
});

describe("GET /jobs", () => {
  beforeAll(async () => {
    const fire = await createJob(estimator, { damageType: "FIRE", customerName: "Filter Fiona" });
    await moveTo(estimator, fire.id, "INSPECTION", "ESTIMATING");
    await createJob(estimator, { damageType: "MOLD" });
  });

  it("returns all jobs with pagination metadata", async () => {
    const res = await api(pm, "GET", "/jobs");
    expect(res.status).toBe(200);
    expect(res.body.response.meta).toMatchObject({ page: 1, limit: 20 });
    expect(res.body.response.meta.total).toBeGreaterThan(10);
  });

  it("filters by status", async () => {
    const res = await api(pm, "GET", "/jobs?status=ESTIMATING&limit=100");
    expect(res.body.response.data.length).toBeGreaterThan(0);
    expect(res.body.response.data.every((j: any) => j.status === "ESTIMATING")).toBe(true);
  });

  it("filters by damage type, combined with status", async () => {
    const mold = await api(pm, "GET", "/jobs?damageType=MOLD&limit=100");
    expect(mold.body.response.data.length).toBeGreaterThan(0);
    expect(mold.body.response.data.every((j: any) => j.damageType === "MOLD")).toBe(true);

    const both = await api(pm, "GET", "/jobs?damageType=FIRE&status=ESTIMATING");
    expect(both.body.response.data.map((j: any) => j.customerName)).toEqual(["Filter Fiona"]);
  });

  it("paginates", async () => {
    const page1 = await api(pm, "GET", "/jobs?page=1&limit=5&sort=createdAt:asc");
    const page2 = await api(pm, "GET", "/jobs?page=2&limit=5&sort=createdAt:asc");
    expect(page1.body.response.data).toHaveLength(5);
    expect(page1.body.response.meta).toMatchObject({ page: 1, limit: 5, hasMore: true });
    const ids1 = page1.body.response.data.map((j: any) => j.id);
    const ids2 = page2.body.response.data.map((j: any) => j.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toEqual([]);
  });

  it("searches customer name, email and address", async () => {
    const res = await api(pm, "GET", "/jobs?search=fiona");
    expect(res.body.response.data.map((j: any) => j.customerName)).toEqual(["Filter Fiona"]);
  });

  it("rejects unknown filter values", async () => {
    expect((await api(pm, "GET", "/jobs?status=DONE")).status).toBe(400);
    expect((await api(pm, "GET", "/jobs?damageType=LAVA")).status).toBe(400);
    expect((await api(pm, "GET", "/jobs?limit=500")).status).toBe(400);
  });
});

describe("PATCH /jobs/:id/status", () => {
  it("applies a valid transition and records it in the status history", async () => {
    const job = await createJob(estimator);
    const res = await api(estimator, "PATCH", `/jobs/${job.id}/status`, { status: "INSPECTION", note: "Booked" });
    expect(res.status).toBe(200);
    expect(res.body.response).toMatchObject({ status: "INSPECTION", allowedTransitions: ["ESTIMATING", "CANCELLED"] });

    const history = await api(pm, "GET", `/jobs/${job.id}/status-history`);
    expect(history.body.response.map((h: any) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "NEW"],
      ["NEW", "INSPECTION"],
    ]);
    expect(history.body.response[1]).toMatchObject({ changedByUserId: estimator.user.id, note: "Booked" });
  });

  it("rejects an invalid transition with 409 and lists the allowed ones", async () => {
    const job = await createJob(estimator);
    const res = await api(admin, "PATCH", `/jobs/${job.id}/status`, { status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      message: "Cannot move a job from NEW to COMPLETED",
      details: { from: "NEW", to: "COMPLETED", allowed: ["INSPECTION", "CANCELLED"] },
    });
  });

  it("blocks COMPLETED -> ESTIMATING", async () => {
    const job = await createJob(estimator);
    await moveTo(estimator, job.id, "INSPECTION", "ESTIMATING");
    await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 1, materialCost: 1, equipmentCost: 1 });
    await moveTo(estimator, job.id, "PROPOSAL_SENT");
    await moveTo(pm, job.id, "APPROVED", "IN_PROGRESS", "COMPLETED");

    const res = await api(admin, "PATCH", `/jobs/${job.id}/status`, { status: "ESTIMATING" });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Job is COMPLETED; its status can no longer change");
  });

  it("blocks CANCELLED -> IN_PROGRESS", async () => {
    const job = await createJob(estimator);
    await moveTo(pm, job.id, "CANCELLED");
    expect((await api(admin, "PATCH", `/jobs/${job.id}/status`, { status: "IN_PROGRESS" })).status).toBe(409);
  });

  it("rejects an invalid status value with 400", async () => {
    const job = await createJob(estimator);
    const res = await api(admin, "PATCH", `/jobs/${job.id}/status`, { status: "DONE" });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe("status");
    expect((await api(admin, "PATCH", `/jobs/${job.id}/status`, {})).status).toBe(400);
  });

  it("rejects a no-op transition", async () => {
    const job = await createJob(estimator);
    expect((await api(admin, "PATCH", `/jobs/${job.id}/status`, { status: "NEW" })).status).toBe(409);
  });

  it("enforces which role owns each step", async () => {
    const job = await createJob(estimator);
    expect((await api(pm, "PATCH", `/jobs/${job.id}/status`, { status: "INSPECTION" })).status).toBe(403);
    await moveTo(estimator, job.id, "INSPECTION", "ESTIMATING");
    await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 10, materialCost: 0, equipmentCost: 0 });
    await moveTo(estimator, job.id, "PROPOSAL_SENT");
    expect((await api(estimator, "PATCH", `/jobs/${job.id}/status`, { status: "APPROVED" })).status).toBe(403);
    expect((await api(pm, "PATCH", `/jobs/${job.id}/status`, { status: "APPROVED" })).status).toBe(200);
  });

  it("requires an estimate before a proposal can be sent", async () => {
    const job = await createJob(estimator);
    await moveTo(estimator, job.id, "INSPECTION", "ESTIMATING");
    const res = await api(estimator, "PATCH", `/jobs/${job.id}/status`, { status: "PROPOSAL_SENT" });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Cannot send a proposal before the job has an estimate");
  });

  it("returns 404 for an unknown job", async () => {
    expect((await api(admin, "PATCH", "/jobs/JOB-99999/status", { status: "INSPECTION" })).status).toBe(404);
  });
});

describe("POST /jobs/:id/estimate", () => {
  it("calculates the total and persists it against the job", async () => {
    const job = await createJob(estimator);
    const res = await api(estimator, "POST", `/jobs/${job.id}/estimate`, {
      laborCost: 1500,
      materialCost: 2000,
      equipmentCost: 500,
    });
    expect(res.status).toBe(200);
    expect(res.body.response.estimatedCost).toBe(4000);
    expect(res.body.response.estimate).toMatchObject({
      laborCost: 1500,
      materialCost: 2000,
      equipmentCost: 500,
      estimatedByUserId: estimator.user.id,
    });

    const reloaded = await api(pm, "GET", `/jobs/${job.id}`);
    expect(reloaded.body.response.estimatedCost).toBe(4000);
  });

  it("is exact to the cent", async () => {
    const job = await createJob(estimator);
    const res = await api(estimator, "POST", `/jobs/${job.id}/estimate`, {
      laborCost: 0.1,
      materialCost: 0.2,
      equipmentCost: 1234.56,
    });
    expect(res.body.response.estimatedCost).toBe(1234.86);
  });

  it("rejects negative costs", async () => {
    const job = await createJob(estimator);
    const res = await api(estimator, "POST", `/jobs/${job.id}/estimate`, {
      laborCost: -100,
      materialCost: 2000,
      equipmentCost: 500,
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: "laborCost", message: "laborCost cannot be negative" }]);
  });

  it("rejects missing, null and non-numeric costs", async () => {
    const job = await createJob(estimator);
    const missing = await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 1500 });
    expect(missing.status).toBe(400);
    expect(missing.body.details.map((d: any) => d.message)).toEqual([
      "materialCost is required",
      "equipmentCost is required",
    ]);
    const wrongType = await api(estimator, "POST", `/jobs/${job.id}/estimate`, {
      laborCost: "1500",
      materialCost: null,
      equipmentCost: "abc",
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.details).toHaveLength(3);
  });

  it("locks the price once the customer has a proposal", async () => {
    const job = await createJob(estimator);
    await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 1, materialCost: 1, equipmentCost: 1 });
    await moveTo(estimator, job.id, "INSPECTION", "ESTIMATING", "PROPOSAL_SENT");
    const res = await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 9, materialCost: 9, equipmentCost: 9 });
    expect(res.status).toBe(409);

    await moveTo(estimator, job.id, "ESTIMATING");
    expect((await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 9, materialCost: 9, equipmentCost: 9 })).body.response.estimatedCost).toBe(27);
  });

  it("is limited to estimators and admins, and 404s for unknown jobs", async () => {
    const job = await createJob(estimator);
    const body = { laborCost: 1, materialCost: 1, equipmentCost: 1 };
    expect((await api(pm, "POST", `/jobs/${job.id}/estimate`, body)).status).toBe(403);
    expect((await api(estimator, "POST", "/jobs/JOB-99999/estimate", body)).status).toBe(404);
  });
});

describe("POST /jobs/:id/ai-assessment", () => {
  it("returns the AI-ready payload in the documented shape", async () => {
    const job = await createJob(estimator);
    await api(estimator, "POST", `/jobs/${job.id}/estimate`, { laborCost: 1500, materialCost: 2000, equipmentCost: 500 });

    const res = await api(estimator, "POST", `/jobs/${job.id}/ai-assessment`);
    expect(res.status).toBe(200);
    expect(res.body.response).toMatchObject({
      jobId: job.id,
      property: { address: "123 Main Street", squareFeet: 450 },
      damage: { type: "WATER", description: "Water damage affecting the kitchen ceiling and wall." },
      currentEstimate: 4000,
      instructions: "Analyze the reported property damage and suggest appropriate restoration actions.",
    });
    expect(JSON.stringify(res.body.response)).not.toContain("john@example.com");
  });

  it("returns 404 for an unknown job", async () => {
    expect((await api(estimator, "POST", "/jobs/JOB-99999/ai-assessment")).status).toBe(404);
  });

  it("reports live analysis as unavailable when no AI key is configured", async () => {
    const job = await createJob(estimator);
    const res = await api(estimator, "POST", `/jobs/${job.id}/ai-assessment/analyze`);
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/ANTHROPIC_API_KEY/);
  });
});
