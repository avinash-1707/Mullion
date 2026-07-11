import { z } from "zod";
import {
  buildRunSchema,
  buildReviewVerdictSchema,
  buildStreamTaskEventSchema,
  type BuildReviewVerdict,
  type BuildStreamTaskEvent,
} from "@mullion/schemas";

// SSE payload shapes for GET /api/builds/:id/stream. "task" (already
// buildStreamTaskEventSchema) and the escalate request body live in
// @mullion/schemas because more than one surface needs them; these three are
// local to the dashboard for now — the one current consumer — per
// CODING_STANDARDS §8's "one schema per route" once a second caller exists.
// Every payload gets parsed here before a component ever sees it
// (CODING_STANDARDS §1: zod at the trust boundary, an SSE payload is
// exactly the kind of input that must never be assumed-shaped).

export const buildPhaseEventSchema = z.object({ status: buildRunSchema.shape.status });
export type BuildPhaseEvent = z.infer<typeof buildPhaseEventSchema>;

export const buildEscalationRequiredEventSchema = z.object({
  specTaskId: z.string(),
  reason: z.string(),
});
export type BuildEscalationRequiredEvent = z.infer<typeof buildEscalationRequiredEventSchema>;

export const deliveryRefSchema = z.object({
  kind: z.string(),
  ref: z.string(),
});
export type DeliveryRef = z.infer<typeof deliveryRefSchema>;

export const buildDeliveryResultEventSchema = z.object({
  deliveries: z.array(deliveryRefSchema),
  isPartial: z.boolean(),
});
export type BuildDeliveryResultEvent = z.infer<typeof buildDeliveryResultEventSchema>;

// One discriminated union covering every event kind the dashboard renders —
// components switch over `kind` exhaustively (CODING_STANDARDS §1), so a
// sixth event type added later is a compile error everywhere it isn't
// handled, not a silent gap in the timeline.
export type BuildTimelineEvent =
  | { kind: "phase"; status: BuildPhaseEvent["status"] }
  | { kind: "task"; task: BuildStreamTaskEvent }
  | { kind: "escalation_required"; specTaskId: string; reason: string }
  | { kind: "review_result"; verdict: BuildReviewVerdict }
  | { kind: "delivery_result"; deliveries: DeliveryRef[]; isPartial: boolean };

const EVENT_SCHEMAS = {
  phase: buildPhaseEventSchema,
  task: buildStreamTaskEventSchema,
  escalation_required: buildEscalationRequiredEventSchema,
  review_result: buildReviewVerdictSchema,
  delivery_result: buildDeliveryResultEventSchema,
} as const;

export type BuildStreamEventType = keyof typeof EVENT_SCHEMAS;

export const BUILD_STREAM_EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as BuildStreamEventType[];

// Parses one raw SSE payload for a known event type into the discriminated
// union above. Returns null on a schema mismatch — callers log and drop the
// event rather than crash the page on an unexpected/malformed payload.
export function parseBuildStreamEvent(type: BuildStreamEventType, payload: unknown): BuildTimelineEvent | null {
  switch (type) {
    case "phase": {
      const parsed = buildPhaseEventSchema.safeParse(payload);
      return parsed.success ? { kind: "phase", status: parsed.data.status } : null;
    }
    case "task": {
      const parsed = buildStreamTaskEventSchema.safeParse(payload);
      return parsed.success ? { kind: "task", task: parsed.data } : null;
    }
    case "escalation_required": {
      const parsed = buildEscalationRequiredEventSchema.safeParse(payload);
      return parsed.success
        ? { kind: "escalation_required", specTaskId: parsed.data.specTaskId, reason: parsed.data.reason }
        : null;
    }
    case "review_result": {
      const parsed = buildReviewVerdictSchema.safeParse(payload);
      return parsed.success ? { kind: "review_result", verdict: parsed.data } : null;
    }
    case "delivery_result": {
      const parsed = buildDeliveryResultEventSchema.safeParse(payload);
      return parsed.success
        ? { kind: "delivery_result", deliveries: parsed.data.deliveries, isPartial: parsed.data.isPartial }
        : null;
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled build stream event type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
