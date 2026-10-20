import { Job } from "@/database/entities";
import {
  DAMAGE_ANALYSIS_JSON_SCHEMA,
  DAMAGE_ASSESSMENT_INSTRUCTIONS,
  DamageAssessmentPayload,
} from "@/core/ai";

const hasBreakdown = (job: Job): boolean =>
  job.laborCost != null && job.materialCost != null && job.equipmentCost != null;

export const buildDamageAssessmentPayload = (job: Job): DamageAssessmentPayload => ({
  jobId: job.id,
  jobStatus: job.status,
  property: {
    address: job.propertyAddress,
    squareFeet: job.squareFeet,
  },
  damage: {
    type: job.damageType,
    description: job.damageDescription,
  },
  currentEstimate: Number(job.estimatedCost ?? 0),
  estimateBreakdown: hasBreakdown(job)
    ? {
        laborCost: Number(job.laborCost),
        materialCost: Number(job.materialCost),
        equipmentCost: Number(job.equipmentCost),
      }
    : null,
  instructions: DAMAGE_ASSESSMENT_INSTRUCTIONS,
  responseFormat: {
    type: "json_schema",
    schema: DAMAGE_ANALYSIS_JSON_SCHEMA,
  },
});
