export interface CostBreakdown {
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
}

const toCents = (amount: number): number => Math.round(amount * 100);

export const calculateEstimatedCost = ({ laborCost, materialCost, equipmentCost }: CostBreakdown): number =>
  (toCents(laborCost) + toCents(materialCost) + toCents(equipmentCost)) / 100;

export const hasAtMostTwoDecimals = (amount: number): boolean =>
  Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;

export const formatJobId = (jobNumber: number): string => `JOB-${String(jobNumber).padStart(3, "0")}`;
