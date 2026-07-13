import { z } from "zod";

// Local schemas for /api/settings/* — no second caller exists yet outside
// this app, so these stay here rather than in @mullion/schemas per
// CODING_STANDARDS §8 ("one schema per route... until a second caller
// exists"), the same reasoning lib/build-stream.ts documents for its own
// locally-owned SSE payload shapes. Every response is parsed here before a
// component ever sees it (CODING_STANDARDS §1: zod at the trust boundary).

export const byokStatusSchema = z.object({
  hasKey: z.boolean(),
  keyLast4: z.string().nullable(),
  enabled: z.boolean(),
  // Mutations are owner/admin-only server-side (ADR-70); this drives the
  // read-only rendering for plain members, never the enforcement.
  canManage: z.boolean(),
});
export type ByokStatus = z.infer<typeof byokStatusSchema>;

export const byokSaveResponseSchema = z.object({
  ok: z.literal(true),
  keyLast4: z.string(),
});

// Fixed display order for the six agent roles — matches the crew order
// used everywhere else in the product (planning icons, decision log).
export const MODEL_ROLES = ["analyst", "planner", "coder", "tester", "reviewer", "devops"] as const;

// `role` stays z.string() (not z.enum(MODEL_ROLES)) so a role the backend
// adds later degrades to an unstyled-but-functional row instead of failing
// the whole GET /models parse — see roleLabel's fallback below.
export const modelRoleConfigSchema = z.object({
  role: z.string(),
  defaultModelSlug: z.string(),
  overrideModelSlug: z.string().nullable(),
  allowlist: z.array(z.string()),
});
export type ModelRoleConfig = z.infer<typeof modelRoleConfigSchema>;

export const modelsResponseSchema = z.object({
  byokEnabled: z.boolean(),
  canManage: z.boolean(),
  roles: z.array(modelRoleConfigSchema),
});
export type ModelsResponse = z.infer<typeof modelsResponseSchema>;

const ROLE_LABELS: Record<string, string> = {
  analyst: "Analyst",
  planner: "Planner",
  coder: "Coder",
  tester: "Tester",
  reviewer: "Reviewer",
  devops: "DevOps",
};

// Falls back to a capitalized raw role string for anything outside the
// known set, rather than throwing — keeps an unrecognized role rendering
// instead of blanking the whole tab.
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export const analyticsTotalsSchema = z.object({
  costUsd: z.number(),
  byokCostUsd: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  llmCalls: z.number(),
});

export const analyticsByRoleSchema = z.object({
  role: z.string(),
  costUsd: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  calls: z.number(),
});
export type AnalyticsByRole = z.infer<typeof analyticsByRoleSchema>;

export const analyticsByDaySchema = z.object({
  day: z.string(),
  costUsd: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
});
export type AnalyticsByDay = z.infer<typeof analyticsByDaySchema>;

export const analyticsResponseSchema = z.object({
  days: z.number(),
  totals: analyticsTotalsSchema,
  byRole: z.array(analyticsByRoleSchema),
  byDay: z.array(analyticsByDaySchema),
});
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;

// Per-run spend list (GET /api/settings/analytics/runs). `costUsd` is the
// run's spend INSIDE the tab's window — cost_events are windowed on their
// own createdAt, so a long-running run shows only its in-window slice and
// the list reconciles with the tiles above (minus planning-session spend,
// which has no run to attach to). Status union mirrors BuildRun["status"].
export const analyticsRunSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "building", "testing", "reviewing", "fixing", "shipping", "done", "failed"]),
  createdAt: z.string(),
  costUsd: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  calls: z.number(),
});
export type AnalyticsRun = z.infer<typeof analyticsRunSchema>;

export const analyticsRunsPageSchema = z.object({
  days: z.number(),
  items: z.array(analyticsRunSchema),
  nextCursor: z.string().nullable(),
});
export type AnalyticsRunsPage = z.infer<typeof analyticsRunsPageSchema>;
