import { z } from "zod";
import { Config } from "@/config";
import { DamageType, JobStatus, UserRole } from "@/database/enums/trs.enums";
import { DAMAGE_ANALYSIS_JSON_SCHEMA } from "@/core/ai";
import { JOB_STATUS_TRANSITIONS, STATUS_CHANGE_ROLES } from "@/modules/jobs/helpers/status-transitions";
import {
  createJobSchema,
  estimateBodySchema,
  updateJobStatusBodySchema,
} from "@/modules/jobs/validation/job.validation";
import { loginSchema, refreshTokenSchema } from "@/modules/global/validation/auth.validation";
import { createUserSchema } from "@/modules/admin/validation/user.validation";

const requestSchema = (schema: z.ZodType) => {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return json;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const json = (schema: unknown) => ({ "application/json": { schema } });

const ok = (description: string, schema: unknown) => ({
  description,
  content: json({
    type: "object",
    required: ["success", "response"],
    properties: {
      success: { type: "boolean", const: true },
      message: { type: "string" },
      response: schema,
    },
  }),
});

const paginated = (item: unknown) => ({
  type: "object",
  properties: {
    data: { type: "array", items: item },
    meta: ref("PaginationMeta"),
  },
});

const error = (description: string) => ({ description, content: json(ref("Error")) });

const errors = {
  400: error("Validation failed or malformed request"),
  401: error("Missing, invalid or expired access token"),
  403: error("Authenticated but not allowed for this role"),
  404: error("Resource not found"),
  409: error("Request conflicts with the current state of the resource"),
  429: error("Rate limit exceeded"),
};

const pick = <K extends keyof typeof errors>(...codes: K[]) =>
  Object.fromEntries(codes.map((code) => [code, errors[code]]));

const jobIdParam = {
  name: "id",
  in: "path",
  required: true,
  description: "Job id, e.g. JOB-001 (case-insensitive)",
  schema: { type: "string", pattern: "^[Jj][Oo][Bb]-\\d{3,}$", example: "JOB-001" },
};

const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  {
    name: "sort",
    in: "query",
    description: "field:asc|desc",
    schema: { type: "string", example: "createdAt:desc" },
  },
];

const transitionTable = Object.values(JobStatus)
  .map((from) => {
    const next = JOB_STATUS_TRANSITIONS[from];
    return `| ${from} | ${next.length ? next.join(", ") : "_terminal_"} | ${
      STATUS_CHANGE_ROLES[from].length ? ["ADMIN", ...STATUS_CHANGE_ROLES[from]].join(", ") : "-"
    } |`;
  })
  .join("\n");

const description = `REST API for TRS restoration estimating.

**Authentication:** call \`POST /auth/login\` with one of the seeded accounts (see README), then click **Authorize** and paste the \`accessToken\`.

**Envelope:** successful responses are \`{ "success": true, "message"?, "response": ... }\`; errors are \`{ "success": false, "message", "code", "details"?, "timestamp", "requestId" }\`.

**Job status rules** (\`PATCH /jobs/{id}/status\`):

| From | May move to | Roles that may move a job INTO this status |
| --- | --- | --- |
${transitionTable}

A job also needs an estimate (\`estimatedCost > 0\`) before it can move to PROPOSAL_SENT, and estimates can only be changed while a job is NEW, INSPECTION or ESTIMATING.`;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "TRS Restoration Estimating API",
    version: Config.service.version,
    description,
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    { name: "Auth" },
    { name: "Jobs" },
    { name: "AI" },
    { name: "Admin" },
    { name: "System" },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check (database, cache, memory)",
        security: [],
        responses: { 200: { description: "Healthy" }, 503: { description: "Unhealthy" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Exchange email and password for an access + refresh token",
        security: [],
        requestBody: { required: true, content: json(requestSchema(loginSchema)) },
        responses: {
          200: ok("Logged in", ref("LoginResult")),
          ...pick(400, 429),
          401: error("Invalid email or password, or the account is deactivated"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate a refresh token (single use) for a new token pair",
        security: [],
        requestBody: { required: true, content: json(requestSchema(refreshTokenSchema)) },
        responses: { 200: ok("New tokens", ref("Tokens")), ...pick(400, 401) },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke a refresh token",
        security: [],
        requestBody: { required: true, content: json(requestSchema(refreshTokenSchema)) },
        responses: { 200: ok("Logged out", { type: "object" }), ...pick(400) },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "The signed-in user",
        responses: { 200: ok("Current user", ref("User")), ...pick(401) },
      },
    },
    "/jobs": {
      post: {
        tags: ["Jobs"],
        summary: "Create a restoration job",
        description: "Roles: ADMIN, ESTIMATOR. The job starts as NEW with estimatedCost 0 and gets the next JOB-### id.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: requestSchema(createJobSchema),
              example: {
                customerName: "John Smith",
                customerEmail: "john@example.com",
                propertyAddress: "123 Main Street",
                damageType: "WATER",
                damageDescription: "Water damage affecting the kitchen ceiling and wall.",
                squareFeet: 450,
              },
            },
          },
        },
        responses: { 201: ok("Created job", ref("Job")), ...pick(400, 401, 403) },
      },
      get: {
        tags: ["Jobs"],
        summary: "List jobs (filterable, paginated)",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: Object.values(JobStatus) } },
          { name: "damageType", in: "query", schema: { type: "string", enum: Object.values(DamageType) } },
          {
            name: "search",
            in: "query",
            description: "Matches customer name, customer email or property address",
            schema: { type: "string" },
          },
          ...pageParams,
        ],
        responses: { 200: ok("Page of jobs", paginated(ref("Job"))), ...pick(400, 401) },
      },
    },
    "/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Get one job",
        parameters: [jobIdParam],
        responses: { 200: ok("Job", ref("Job")), ...pick(400, 401, 404) },
      },
    },
    "/jobs/{id}/status": {
      patch: {
        tags: ["Jobs"],
        summary: "Move a job to another status",
        description: "Only transitions in the table above are accepted. Invalid statuses return 400; disallowed transitions return 409; a role that does not own the target status gets 403.",
        parameters: [jobIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: requestSchema(updateJobStatusBodySchema),
              example: { status: "INSPECTION", note: "Site visit booked for Tuesday" },
            },
          },
        },
        responses: { 200: ok("Updated job", ref("Job")), ...pick(400, 401, 403, 404, 409) },
      },
    },
    "/jobs/{id}/status-history": {
      get: {
        tags: ["Jobs"],
        summary: "Audit trail of the job's status changes, oldest first",
        parameters: [jobIdParam],
        responses: {
          200: ok("Status history", { type: "array", items: ref("StatusChange") }),
          ...pick(400, 401, 404),
        },
      },
    },
    "/jobs/{id}/estimate": {
      post: {
        tags: ["Jobs"],
        summary: "Calculate and save the estimated restoration cost",
        description: "Roles: ADMIN, ESTIMATOR. estimatedCost = laborCost + materialCost + equipmentCost (exact to the cent). Allowed while the job is NEW, INSPECTION or ESTIMATING.",
        parameters: [jobIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: requestSchema(estimateBodySchema),
              example: { laborCost: 1500, materialCost: 2000, equipmentCost: 500 },
            },
          },
        },
        responses: { 200: ok("Job with the new estimate", ref("Job")), ...pick(400, 401, 403, 404, 409) },
      },
    },
    "/jobs/{id}/ai-assessment": {
      post: {
        tags: ["AI"],
        summary: "Build the structured payload an AI service would receive",
        description: "Roles: ADMIN, ESTIMATOR. No AI call is made. Customer name and email are deliberately excluded.",
        parameters: [jobIdParam],
        responses: { 200: ok("AI-ready payload", ref("DamageAssessmentPayload")), ...pick(400, 401, 403, 404) },
      },
    },
    "/jobs/{id}/ai-assessment/analyze": {
      post: {
        tags: ["AI"],
        summary: "Send the payload to Claude and return a structured analysis",
        description: "Roles: ADMIN, ESTIMATOR. Requires ANTHROPIC_API_KEY. The analysis is returned, not stored on the job.",
        parameters: [jobIdParam],
        responses: {
          200: ok("Analysis", ref("DamageAnalysisResult")),
          ...pick(400, 401, 403, 404, 429),
          502: error("The AI provider failed or returned an unusable answer"),
          503: error("AI analysis is not configured or the provider is busy"),
        },
      },
    },
    "/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List staff accounts",
        parameters: [
          { name: "role", in: "query", schema: { type: "string", enum: Object.values(UserRole) } },
          { name: "isActive", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "search", in: "query", schema: { type: "string" } },
          ...pageParams,
        ],
        responses: { 200: ok("Page of users", paginated(ref("User"))), ...pick(401, 403) },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a staff account",
        requestBody: { required: true, content: json(requestSchema(createUserSchema)) },
        responses: { 201: ok("Created user", ref("User")), ...pick(400, 401, 403, 409) },
      },
    },
    "/admin/users/{userId}": {
      patch: {
        tags: ["Admin"],
        summary: "Change a user's name, role or active flag (role changes and deactivation revoke sessions)",
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: json({
            type: "object",
            properties: {
              fullName: { type: "string" },
              role: { type: "string", enum: Object.values(UserRole) },
              isActive: { type: "boolean" },
            },
          }),
        },
        responses: { 200: ok("Updated user", ref("User")), ...pick(400, 401, 403, 404, 409) },
      },
    },
    "/admin/audit-logs": {
      get: {
        tags: ["Admin"],
        summary: "Search the audit log (logins, job changes, estimates, AI calls, user changes)",
        parameters: [
          { name: "action", in: "query", schema: { type: "string", example: "job.status_changed" } },
          { name: "resourceType", in: "query", schema: { type: "string", example: "job" } },
          { name: "resourceId", in: "query", schema: { type: "string", example: "JOB-001" } },
          { name: "userId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          ...pageParams,
        ],
        responses: { 200: ok("Page of audit entries", paginated({ type: "object" })), ...pick(401, 403) },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["success", "message", "code"],
        properties: {
          success: { type: "boolean", const: false },
          message: { type: "string", example: "Job not found" },
          code: { type: "string", example: "NOT_FOUND" },
          details: {
            description: "Present for validation errors: [{ path, message }]",
            type: "array",
            items: {
              type: "object",
              properties: { path: { type: "string" }, message: { type: "string" } },
            },
          },
          timestamp: { type: "string", format: "date-time" },
          requestId: { type: "string" },
        },
      },
      PaginationMeta: {
        type: "object",
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          limit: { type: "integer" },
          totalPages: { type: "integer" },
          hasMore: { type: "boolean" },
        },
      },
      Job: {
        type: "object",
        properties: {
          id: { type: "string", example: "JOB-001" },
          customerName: { type: "string", example: "John Smith" },
          customerEmail: { type: "string", format: "email", example: "john@example.com" },
          propertyAddress: { type: "string", example: "123 Main Street" },
          damageType: { type: "string", enum: Object.values(DamageType) },
          damageDescription: { type: "string" },
          squareFeet: { type: "integer", example: 450 },
          status: { type: "string", enum: Object.values(JobStatus) },
          estimatedCost: { type: "number", example: 4000 },
          estimate: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                properties: {
                  laborCost: { type: "number" },
                  materialCost: { type: "number" },
                  equipmentCost: { type: "number" },
                  estimatedAt: { type: "string", format: "date-time" },
                  estimatedByUserId: { type: "string", format: "uuid" },
                },
              },
            ],
          },
          allowedTransitions: {
            type: "array",
            description: "Statuses this job may move to next",
            items: { type: "string", enum: Object.values(JobStatus) },
          },
          createdByUserId: { type: ["string", "null"], format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      StatusChange: {
        type: "object",
        properties: {
          fromStatus: { type: ["string", "null"], enum: [...Object.values(JobStatus), null] },
          toStatus: { type: "string", enum: Object.values(JobStatus) },
          changedByUserId: { type: ["string", "null"], format: "uuid" },
          note: { type: ["string", "null"] },
          changedAt: { type: "string", format: "date-time" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          fullName: { type: "string" },
          role: { type: "string", enum: Object.values(UserRole) },
          isActive: { type: "boolean" },
          lastLoginAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Tokens: {
        type: "object",
        properties: { accessToken: { type: "string" }, refreshToken: { type: "string" } },
      },
      LoginResult: {
        allOf: [ref("Tokens"), { type: "object", properties: { user: ref("User") } }],
      },
      DamageAssessmentPayload: {
        type: "object",
        properties: {
          jobId: { type: "string", example: "JOB-001" },
          jobStatus: { type: "string", enum: Object.values(JobStatus) },
          property: {
            type: "object",
            properties: {
              address: { type: "string", example: "123 Main Street" },
              squareFeet: { type: "integer", example: 450 },
            },
          },
          damage: {
            type: "object",
            properties: {
              type: { type: "string", enum: Object.values(DamageType) },
              description: { type: "string" },
            },
          },
          currentEstimate: { type: "number", example: 4000 },
          estimateBreakdown: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                properties: {
                  laborCost: { type: "number" },
                  materialCost: { type: "number" },
                  equipmentCost: { type: "number" },
                },
              },
            ],
          },
          instructions: { type: "string" },
          responseFormat: {
            type: "object",
            properties: {
              type: { type: "string", const: "json_schema" },
              schema: { type: "object", description: "JSON Schema of the expected DamageAnalysis" },
            },
          },
        },
      },
      DamageAnalysis: DAMAGE_ANALYSIS_JSON_SCHEMA,
      DamageAnalysisResult: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          provider: { type: "string", example: "anthropic" },
          model: { type: "string", example: "claude-opus-5-5" },
          generatedAt: { type: "string", format: "date-time" },
          payload: ref("DamageAssessmentPayload"),
          analysis: ref("DamageAnalysis"),
        },
      },
    },
  },
};
