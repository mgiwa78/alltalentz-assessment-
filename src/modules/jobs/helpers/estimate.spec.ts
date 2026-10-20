import { calculateEstimatedCost, formatJobId, hasAtMostTwoDecimals } from "./estimate";

describe("calculateEstimatedCost", () => {
  it("sums labor, material and equipment", () => {
    expect(calculateEstimatedCost({ laborCost: 1500, materialCost: 2000, equipmentCost: 500 })).toBe(4000);
  });

  it("does not drift on fractional amounts", () => {
    expect(calculateEstimatedCost({ laborCost: 0.1, materialCost: 0.2, equipmentCost: 0 })).toBe(0.3);
    expect(calculateEstimatedCost({ laborCost: 1234.56, materialCost: 99.99, equipmentCost: 0.45 })).toBe(1335);
  });

  it("allows an all-zero estimate", () => {
    expect(calculateEstimatedCost({ laborCost: 0, materialCost: 0, equipmentCost: 0 })).toBe(0);
  });
});

describe("hasAtMostTwoDecimals", () => {
  it("accepts whole and cent amounts", () => {
    expect(hasAtMostTwoDecimals(1500)).toBe(true);
    expect(hasAtMostTwoDecimals(19.99)).toBe(true);
    expect(hasAtMostTwoDecimals(0.1 + 0.2)).toBe(true);
  });

  it("rejects fractions of a cent", () => {
    expect(hasAtMostTwoDecimals(19.999)).toBe(false);
  });
});

describe("formatJobId", () => {
  it("pads to three digits and grows past them", () => {
    expect(formatJobId(1)).toBe("JOB-001");
    expect(formatJobId(42)).toBe("JOB-042");
    expect(formatJobId(1234)).toBe("JOB-1234");
  });
});
