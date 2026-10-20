import { DamageAnalysis, DamageAssessmentPayload } from "./damage-assessment.schema";

export interface DamageAnalysisResult {
  analysis: DamageAnalysis;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface DamageAssessmentProvider {
  readonly name: string;
  analyze(payload: DamageAssessmentPayload): Promise<DamageAnalysisResult>;
}
