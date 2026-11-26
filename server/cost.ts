import type { AppConfig } from "./config";
import { estimateMicros } from "./providers/documented";
import { reserve, type BudgetLimits, type PersistDatabase } from "./persist.mjs";

export function limitsFrom(config: AppConfig): BudgetLimits {
  return {
    projectMicros: config.budgets.projectMicros,
    runMicros: config.budgets.runMicros,
    dailyMicros: config.budgets.dailyMicros,
    monthlyMicros: config.budgets.monthlyMicros,
  };
}

export function reserveForOperation(db: PersistDatabase, input: {
  providerId: string;
  operation: string;
  modelId?: string | null;
  quantity?: number | null;
  estimatedMicros?: number | null;
  limits?: BudgetLimits;
  now: string;
  projectId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  unit?: string | null;
}) {
  let estimated = input.estimatedMicros ?? null;
  if (estimated == null) {
    estimated = input.quantity == null ? null : estimateMicros(input.providerId, input.modelId ?? null, input.operation, input.quantity);
    if (estimated == null) {
      return { ok: false as const, code: "price_unverified", message: "No verified price is stored for this operation, and no explicit estimate was provided." };
    }
  }
  return reserve(db, {
    estimatedMicros: estimated,
    limits: input.limits,
    now: input.now,
    projectId: input.projectId,
    runId: input.runId,
    providerId: input.providerId,
    operation: input.operation,
    modelId: input.modelId,
    jobId: input.jobId,
    unit: input.unit,
    quantity: input.quantity,
  });
}
