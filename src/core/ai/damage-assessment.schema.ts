import { z } from "zod";
import { DamageType, JobStatus } from "@/database/enums/trs.enums";

export const DAMAGE_ASSESSMENT_INSTRUCTIONS =
  "Analyze the reported property damage and suggest appropriate restoration actions.";

export const damageAnalysisSchema = z.object({
  severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]),
  summary: z.string().describe("Two or three sentences an estimator can paste into a job note."),
  likelyAffectedAreas: z.array(z.string()),
  recommendedActions: z.array(
    z.object({
      step: z.number().int(),
      action: z.string(),
      rationale: z.string(),
      priority: z.enum(["IMMEDIATE", "HIGH", "NORMAL"]),
    }),
  ),
  safetyConcerns: z.array(z.string()),
  requiresSpecialist: z.boolean(),
  estimatedDurationDays: z.number().int(),
  estimateReview: z.object({
    verdict: z.enum(["NO_ESTIMATE", "LIKELY_LOW", "REASONABLE", "LIKELY_HIGH"]),
    reasoning: z.string(),
  }),
  followUpQuestions: z
    .array(z.string())
    .describe("What the estimator should confirm on site before finalising the proposal."),
});

export type DamageAnalysis = z.infer<typeof damageAnalysisSchema>;

export interface DamageAssessmentPayload {
  jobId: string;
  jobStatus: JobStatus;
  property: {
    address: string;
    squareFeet: number;
  };
  damage: {
    type: DamageType;
    description: string;
  };
  currentEstimate: number;
  estimateBreakdown: {
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
  } | null;
  instructions: string;
  responseFormat: {
    type: "json_schema";
    schema: Record<string, unknown>;
  };
}

const { $schema: _ignored, ...damageAnalysisJsonSchema } = z.toJSONSchema(damageAnalysisSchema);

export const DAMAGE_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = damageAnalysisJsonSchema;
