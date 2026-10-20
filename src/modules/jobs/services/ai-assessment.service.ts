import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { ServiceUnavailableError } from "@/common/errors";
import { recordAction } from "@/common/monitoring/audit";
import { User } from "@/database/entities";
import { DamageAssessmentPayload, getDamageAssessmentProvider } from "@/core/ai";
import { buildDamageAssessmentPayload } from "../helpers/ai-assessment";
import { JobService } from "./job.service";

export class AiAssessmentService {
  private jobService: JobService;

  constructor(dataSource: DataSource, redis?: RedisClient) {
    this.jobService = new JobService(dataSource, redis);
  }

  buildPayload = async (jobId: string): Promise<DamageAssessmentPayload> =>
    buildDamageAssessmentPayload(await this.jobService.getJob(jobId));

  analyze = async (actor: User, jobId: string) => {
    const provider = getDamageAssessmentProvider();
    if (!provider) {
      throw new ServiceUnavailableError("AI analysis is not configured (set ANTHROPIC_API_KEY)");
    }

    const payload = await this.buildPayload(jobId);
    const result = await provider.analyze(payload);

    recordAction("job.ai_analyzed", actor.id, "job", jobId, {
      provider: provider.name,
      model: result.model,
      severity: result.analysis.severity,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return {
      jobId,
      provider: provider.name,
      model: result.model,
      generatedAt: new Date().toISOString(),
      payload,
      analysis: result.analysis,
    };
  };
}
