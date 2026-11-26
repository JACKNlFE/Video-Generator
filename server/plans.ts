import { z } from "zod";

export const productionPlanSchema = z.object({
  version: z.literal(1),
  projectId: z.string().uuid(),
  request: z.string().min(1).max(4000),
  route: z.enum(["fast", "advanced", "maximum"]),
  durationMs: z.number().int().positive(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5", "4:3"]),
  scenes: z.array(z.object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    purpose: z.string().max(500),
    visual: z.string().max(1000),
    generate: z.boolean(),
  })).max(40),
  success: z.array(z.string().max(300)).max(20),
}).strict();

export type ProductionPlan = z.infer<typeof productionPlanSchema>;

export function parsePlan(input: unknown): { ok: true; plan: ProductionPlan } | { ok: false; message: string } {
  const parsed = productionPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid plan." };
  return { ok: true, plan: parsed.data };
}
