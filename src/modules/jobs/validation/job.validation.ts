import { z } from "zod";
import { paginationQuerySchema } from "@/common/middleware/validation";
import { DamageType, JobStatus } from "@/database/enums/trs.enums";
import { hasAtMostTwoDecimals } from "../helpers/estimate";

const MAX_COST = 10_000_000;
const MAX_SQUARE_FEET = 1_000_000;

const typeError = (field: string, type: string) => (issue: { input: unknown }) =>
  issue.input === undefined ? `${field} is required` : `${field} must be ${type}`;

const requiredString = (field: string, max: number) =>
  z
    .string({ error: typeError(field, "a string") })
    .trim()
    .min(1, `${field} cannot be empty`)
    .max(max, `${field} must be at most ${max} characters`);

const enumOf = <T extends Record<string, string>>(field: string, values: T) =>
  z.enum(values, {
    error: (issue) =>
      issue.input === undefined
        ? `${field} is required`
        : `${field} must be one of: ${Object.values(values).join(", ")}`,
  });

const cost = (field: string) =>
  z
    .number({ error: typeError(field, "a number") })
    .nonnegative(`${field} cannot be negative`)
    .max(MAX_COST, `${field} cannot exceed ${MAX_COST}`)
    .refine(hasAtMostTwoDecimals, `${field} can have at most 2 decimal places`);

export const jobIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^JOB-\d{3,}$/, "id must be a job id such as JOB-001"),
});

export const createJobSchema = z.object({
  customerName: requiredString("customerName", 120),
  customerEmail: z
    .string({ error: typeError("customerEmail", "a string") })
    .trim()
    .toLowerCase()
    .max(320, "customerEmail must be at most 320 characters")
    .pipe(z.email("customerEmail must be a valid email address")),
  propertyAddress: requiredString("propertyAddress", 300),
  damageType: enumOf("damageType", DamageType),
  damageDescription: requiredString("damageDescription", 5000),
  squareFeet: z
    .number({ error: typeError("squareFeet", "a number") })
    .int("squareFeet must be a whole number")
    .positive("squareFeet must be greater than 0")
    .max(MAX_SQUARE_FEET, `squareFeet cannot exceed ${MAX_SQUARE_FEET}`),
});

export const listJobsQuerySchema = paginationQuerySchema.extend({
  status: enumOf("status", JobStatus).optional(),
  damageType: enumOf("damageType", DamageType).optional(),
});

export const updateJobStatusBodySchema = z.object({
  status: enumOf("status", JobStatus),
  note: z.string().trim().max(1000, "note must be at most 1000 characters").optional(),
});

export const updateJobStatusSchema = jobIdParamSchema.extend(updateJobStatusBodySchema.shape);

export const estimateBodySchema = z.object({
  laborCost: cost("laborCost"),
  materialCost: cost("materialCost"),
  equipmentCost: cost("equipmentCost"),
});

export const estimateJobSchema = jobIdParamSchema.extend(estimateBodySchema.shape);

export type CreateJobDTO = z.infer<typeof createJobSchema>;
export type ListJobsQueryDTO = z.infer<typeof listJobsQuerySchema>;
export type UpdateJobStatusDTO = z.infer<typeof updateJobStatusSchema>;
export type EstimateJobDTO = z.infer<typeof estimateJobSchema>;
