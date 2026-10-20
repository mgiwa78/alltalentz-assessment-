import { UserRole } from "@/database/enums/trs.enums";
import { DamageAnalysis, DamageAssessmentPayload, DamageAssessmentProvider, setDamageAssessmentProvider } from "@/core/ai";
import { BadGatewayError } from "@/common/errors";
import { api, createJob, makeUser, start, stop, TestUser } from "./harness";

const analysis: DamageAnalysis = {
  severity: "MODERATE",
  summary: "Ceiling and wall water damage in the kitchen.",
  likelyAffectedAreas: ["kitchen ceiling", "kitchen wall"],
  recommendedActions: [
    { step: 1, action: "Find and stop the leak source", rationale: "Prevents further damage", priority: "IMMEDIATE" },
  ],
  safetyConcerns: [],
  requiresSpecialist: false,
  estimatedDurationDays: 4,
  estimateReview: { verdict: "REASONABLE", reasoning: "In line with 450 sq ft." },
  followUpQuestions: ["Is the ceiling sagging?"],
};

class FakeProvider implements DamageAssessmentProvider {
  readonly name = "fake";
  received: DamageAssessmentPayload[] = [];
  fail = false;

  async analyze(payload: DamageAssessmentPayload) {
    this.received.push(payload);
    if (this.fail) throw new BadGatewayError("The AI provider returned an error (500)");
    return { analysis, model: "fake-model", usage: { inputTokens: 10, outputTokens: 20 } };
  }
}

let estimator: TestUser, pm: TestUser, admin: TestUser;
const provider = new FakeProvider();

beforeAll(async () => {
  await start();
  setDamageAssessmentProvider(provider);
  estimator = await makeUser(UserRole.ESTIMATOR);
  pm = await makeUser(UserRole.PROJECT_MANAGER);
  admin = await makeUser(UserRole.ADMIN);
});
afterAll(stop);

describe("POST /jobs/:id/ai-assessment/analyze", () => {
  it("sends the payload to the provider and returns the structured analysis", async () => {
    const job = await createJob(estimator);
    const res = await api(estimator, "POST", `/jobs/${job.id}/ai-assessment/analyze`);

    expect(res.status).toBe(200);
    expect(res.body.response).toMatchObject({ jobId: job.id, provider: "fake", model: "fake-model", analysis });
    expect(provider.received[provider.received.length - 1]).toMatchObject({ jobId: job.id, currentEstimate: 0 });
    expect(res.body.response.payload).toEqual(JSON.parse(JSON.stringify(provider.received[provider.received.length - 1])));
  });

  it("writes the call to the audit log", async () => {
    const job = await createJob(estimator);
    await api(estimator, "POST", `/jobs/${job.id}/ai-assessment/analyze`);
    const logs = await api(admin, "GET", `/admin/audit-logs?action=job.ai_analyzed&resourceId=${job.id}`);
    expect(logs.body.response.data[0]).toMatchObject({ userId: estimator.user.id, metadata: { model: "fake-model", severity: "MODERATE" } });
  });

  it("surfaces provider failures as 502", async () => {
    const job = await createJob(estimator);
    provider.fail = true;
    const res = await api(estimator, "POST", `/jobs/${job.id}/ai-assessment/analyze`);
    provider.fail = false;
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ success: false, code: "BAD_GATEWAY" });
  });

  it("is limited to estimators and admins", async () => {
    const job = await createJob(estimator);
    expect((await api(pm, "POST", `/jobs/${job.id}/ai-assessment/analyze`)).status).toBe(403);
  });
});
