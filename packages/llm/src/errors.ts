// Typed failure classes (CODING_STANDARDS §4) — callers branch on
// instanceof / `retryable`, never on message substrings.

export class OpenRouterError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly providerName: string | undefined;

  constructor(args: {
    message: string;
    status: number;
    retryable: boolean;
    providerName?: string | undefined;
  }) {
    super(args.message);
    this.name = "OpenRouterError";
    this.status = args.status;
    this.retryable = args.retryable;
    this.providerName = args.providerName;
  }
}

/**
 * 503 "no provider meets routing requirements" — under ADR-27 this means no
 * ZDR endpoint for the pinned model is up. Never handled by swapping models
 * (ADR-26); it surfaces to the caller's retry/escalation mechanism.
 */
export class NoZdrProviderAvailableError extends OpenRouterError {
  constructor(message: string) {
    super({ message, status: 503, retryable: true });
    this.name = "NoZdrProviderAvailableError";
  }
}

/** The model replied, but not in the shape we were promised. */
export class MalformedLlmResponseError extends Error {
  readonly raw: unknown;

  constructor(message: string, raw: unknown) {
    super(message);
    this.name = "MalformedLlmResponseError";
    this.raw = raw;
  }
}

/**
 * Replay mode found no cassette for this request (ADR-11). A miss is a hard
 * failure by design — replay must be deterministic, never a silent fallback
 * to a live (paid, nondeterministic) call.
 */
export class LlmReplayMissError extends Error {
  readonly cassetteKey: string;
  readonly cassettePath: string;

  constructor(args: { cassetteKey: string; cassettePath: string; requestedModel: string | undefined }) {
    super(
      `No LLM cassette for key ${args.cassetteKey}` +
        (args.requestedModel ? ` (model ${args.requestedModel})` : "") +
        ` at ${args.cassettePath} — record it first (LLM_REPLAY_MODE=record)`,
    );
    this.name = "LlmReplayMissError";
    this.cassetteKey = args.cassetteKey;
    this.cassettePath = args.cassettePath;
  }
}

export class UnknownRoleError extends Error {
  constructor(role: string) {
    super(`No model_routing row for role "${role}" — seed the routing table first`);
    this.name = "UnknownRoleError";
  }
}
