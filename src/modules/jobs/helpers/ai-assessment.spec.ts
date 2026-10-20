import { Job } from "@/database/entities";
import { DamageType, JobStatus } from "@/database/enums/trs.enums";
import { damageAnalysisSchema } from "@/core/ai";
import { buildDamageAssessmentPayload } from "./ai-assessment";

const job = (overrides: Partial<Job> = {}): Job =>
  Object.assign(new Job(), {
    id: "JOB-001",
    jobNumber: 1,
    customerName: "John Smith",
    customerEmail: "john@example.com",
    propertyAddress: "123 Main Street",
    damageType: DamageType.WATER,
    damageDescription: "Water damage affecting the kitchen ceiling and wall.",
    squareFeet: 450,
    status: JobStatus.ESTIMATING,
    estimatedCost: 4000,
    laborCost: 1500,
    materialCost: 2000,
    equipmentCost: 500,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe("buildDamageAssessmentPayload", () => {
  it("matches the shape from the brief", () => {
    const payload = buildDamageAssessmentPayload(job());
    expect(payload).toMatchObject({
      jobId: "JOB-001",
      property: { address: "123 Main Street", squareFeet: 450 },
      damage: { type: "WATER", description: "Water damage affecting the kitchen ceiling and wall." },
      currentEstimate: 4000,
      instructions: "Analyze the reported property damage and suggest appropriate restoration actions.",
    });
    expect(payload.estimateBreakdown).toEqual({ laborCost: 1500, materialCost: 2000, equipmentCost: 500 });
  });

  it("never includes customer contact details", () => {
    const serialized = JSON.stringify(buildDamageAssessmentPayload(job()));
    expect(serialized).not.toContain("John Smith");
    expect(serialized).not.toContain("john@example.com");
  });

  it("reports no breakdown before the job is estimated", () => {
    const payload = buildDamageAssessmentPayload(
      job({ estimatedCost: 0, laborCost: null, materialCost: null, equipmentCost: null }),
    );
    expect(payload.currentEstimate).toBe(0);
    expect(payload.estimateBreakdown).toBeNull();
  });

  it("ships the expected response schema with the payload", () => {
    const { responseFormat } = buildDamageAssessmentPayload(job());
    expect(responseFormat.type).toBe("json_schema");
    expect(responseFormat.schema).toMatchObject({ type: "object" });
    expect((responseFormat.schema as any).required).toEqual(Object.keys(damageAnalysisSchema.shape));
  });
});
