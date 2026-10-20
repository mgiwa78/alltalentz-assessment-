import {
  createJobSchema,
  estimateJobSchema,
  jobIdParamSchema,
  listJobsQuerySchema,
  updateJobStatusSchema,
} from "./job.validation";

const validJob = {
  customerName: "John Smith",
  customerEmail: "john@example.com",
  propertyAddress: "123 Main Street",
  damageType: "WATER",
  damageDescription: "Water damage affecting the kitchen ceiling and wall.",
  squareFeet: 450,
};

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe("createJobSchema", () => {
  it("accepts the example request and normalises it", () => {
    const parsed = createJobSchema.parse({ ...validJob, customerEmail: "  John@Example.COM ", customerName: " John Smith " });
    expect(parsed.customerEmail).toBe("john@example.com");
    expect(parsed.customerName).toBe("John Smith");
  });

  it("strips fields the client may not set", () => {
    const parsed = createJobSchema.parse({ ...validJob, status: "APPROVED", estimatedCost: 99999, id: "JOB-999" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("estimatedCost");
    expect(parsed).not.toHaveProperty("id");
  });

  it("reports every missing required field", () => {
    const result = createJobSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        "customerName is required",
        "customerEmail is required",
        "propertyAddress is required",
        "damageType is required",
        "damageDescription is required",
        "squareFeet is required",
      ]),
    );
  });

  it("rejects blank strings", () => {
    expect(messages(createJobSchema.safeParse({ ...validJob, customerName: "   " }))).toContain("customerName cannot be empty");
  });

  it("rejects an invalid email", () => {
    expect(messages(createJobSchema.safeParse({ ...validJob, customerEmail: "not-an-email" }))).toContain(
      "customerEmail must be a valid email address",
    );
  });

  it("rejects an unknown damage type", () => {
    expect(messages(createJobSchema.safeParse({ ...validJob, damageType: "EARTHQUAKE" }))).toContain(
      "damageType must be one of: WATER, FIRE, MOLD, STORM, OTHER",
    );
  });

  it.each([
    [0, "squareFeet must be greater than 0"],
    [-10, "squareFeet must be greater than 0"],
    [12.5, "squareFeet must be a whole number"],
    ["450", "squareFeet must be a number"],
    [2_000_000, "squareFeet cannot exceed 1000000"],
  ])("rejects squareFeet=%p", (squareFeet, message) => {
    expect(messages(createJobSchema.safeParse({ ...validJob, squareFeet }))).toContain(message);
  });
});

describe("estimateJobSchema", () => {
  const body = { id: "JOB-001", laborCost: 1500, materialCost: 2000, equipmentCost: 500 };

  it("accepts the example request", () => {
    expect(estimateJobSchema.safeParse(body).success).toBe(true);
  });

  it("rejects negative costs", () => {
    expect(messages(estimateJobSchema.safeParse({ ...body, laborCost: -1 }))).toContain("laborCost cannot be negative");
  });

  it("rejects missing costs", () => {
    const { equipmentCost: _omit, ...rest } = body;
    expect(messages(estimateJobSchema.safeParse(rest))).toContain("equipmentCost is required");
  });

  it.each([["1500"], [null], [true], [{}]])("rejects non-numeric laborCost=%p", (laborCost) => {
    expect(messages(estimateJobSchema.safeParse({ ...body, laborCost }))).toContain("laborCost must be a number");
  });

  it("rejects fractions of a cent", () => {
    expect(messages(estimateJobSchema.safeParse({ ...body, materialCost: 10.555 }))).toContain(
      "materialCost can have at most 2 decimal places",
    );
  });
});

describe("updateJobStatusSchema", () => {
  it("accepts a known status", () => {
    expect(updateJobStatusSchema.safeParse({ id: "JOB-001", status: "ESTIMATING" }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(messages(updateJobStatusSchema.safeParse({ id: "JOB-001", status: "DONE" }))[0]).toMatch(/^status must be one of/);
  });
});

describe("jobIdParamSchema", () => {
  it("normalises case", () => {
    expect(jobIdParamSchema.parse({ id: "job-007" }).id).toBe("JOB-007");
  });

  it("rejects malformed ids", () => {
    expect(jobIdParamSchema.safeParse({ id: "7" }).success).toBe(false);
  });
});

describe("listJobsQuerySchema", () => {
  it("coerces pagination and validates filters", () => {
    expect(listJobsQuerySchema.parse({ page: "2", limit: "20", status: "ESTIMATING" })).toMatchObject({
      page: 2,
      limit: 20,
      status: "ESTIMATING",
    });
    expect(listJobsQuerySchema.safeParse({ damageType: "LAVA" }).success).toBe(false);
    expect(listJobsQuerySchema.safeParse({ limit: "1000" }).success).toBe(false);
  });
});
