import { Config } from "@/config";
import { DamageAssessmentProvider } from "./ai-provider.interface";
import { AnthropicDamageAssessmentProvider } from "./anthropic.provider";

export * from "./ai-provider.interface";
export * from "./damage-assessment.schema";

let provider: DamageAssessmentProvider | null | undefined;

export const getDamageAssessmentProvider = (): DamageAssessmentProvider | null => {
  if (provider === undefined) {
    provider = Config.ai.apiKey ? new AnthropicDamageAssessmentProvider(Config.ai.apiKey) : null;
  }
  return provider;
};

export const setDamageAssessmentProvider = (next: DamageAssessmentProvider | null | undefined): void => {
  provider = next;
};
