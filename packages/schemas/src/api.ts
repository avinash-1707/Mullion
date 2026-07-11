import { z } from "zod";

// One schema per route (CODING_STANDARDS §8) — imported by both the Hono
// handler and the Next.js client, never duplicated.

export const createPlanningSessionBodySchema = z.object({
  idea: z.string().min(1).max(10_000),
});

export const planningSessionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  userId: z.string(),
  status: z.enum(["active", "confirmed", "abandoned"]),
  phase: z.enum(["requirements", "architecture"]),
  agentState: z.enum(["idle", "working", "error"]),
  idea: z.string(),
  createdAt: z.string(),
});

export type PlanningSession = z.infer<typeof planningSessionSchema>;

export const streamEventSchema = z.object({
  id: z.number().int(),
  streamId: z.string().uuid(),
  eventType: z.string(),
  payload: z.unknown(),
});

export type StreamEvent = z.infer<typeof streamEventSchema>;

// M3: start a build run from a frozen Build Spec (Fork B entry).
export const createBuildBodySchema = z.object({
  buildSpecId: z.string().uuid(),
});

export const buildRunSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  userId: z.string(),
  buildSpecId: z.string().uuid(),
  status: z.enum([
    "queued",
    "building",
    "testing",
    "reviewing",
    "fixing",
    "shipping",
    "done",
    "failed",
  ]),
  createdAt: z.string(),
});

export type BuildRun = z.infer<typeof buildRunSchema>;
