import { trace } from "@opentelemetry/api";
import { pino, type DestinationStream, type Logger } from "pino";

/**
 * Shared structured logger (ADR-63). pino to stdout: JSON in prod, pretty in
 * dev. Depends ONLY on @opentelemetry/api (never @mullion/otel) so
 * @mullion/otel can itself log without a dependency cycle — the api package's
 * no-op provider makes the mixin free until a process registers a real one.
 *
 * Consumption model (ADR-63): entry points call initLogger() once, before
 * startOtel(); everything else uses childLogger()/getLogger(). Create child
 * loggers inside functions/factories, never at module top level — a module
 * scope child would bind to the lazy fallback root before initLogger() runs.
 * Temporal workflow code (the zero-IO isolate) must never import this.
 */

export type { Logger };

/**
 * Defense-in-depth only (ADR-63): the policy is to never pass secrets or LLM
 * prompt/completion bodies to the logger in the first place — stdout sits
 * outside the ZDR guarantee (ADR-27).
 */
const REDACT_PATHS = [
  "authorization",
  "*.authorization",
  "headers.authorization",
  "*.headers.authorization",
  "cookie",
  "headers.cookie",
  "*.headers.cookie",
  'headers["set-cookie"]',
  '*.headers["set-cookie"]',
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "access_token",
  "*.access_token",
  "apiKey",
  "*.apiKey",
  "api_key",
  "*.api_key",
  "password",
  "*.password",
  "prompt",
  "*.prompt",
  "completion",
  "*.completion",
  "messages",
  "*.messages",
];

/**
 * type/message/stack ONLY — pino's stdSerializers.err also copies an error's
 * extra enumerable properties, which is exactly how an SDK error leaks (an
 * Octokit error embeds request.headers.authorization).
 */
function errSerializer(err: unknown): Record<string, string> {
  if (!(err instanceof Error)) return { message: String(err) };
  return {
    type: err.name,
    message: err.message,
    ...(err.stack !== undefined ? { stack: err.stack } : {}),
  };
}

/** trace_id/span_id stamped on every line while a span is active (02 §9). */
function traceMixin(): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && spanContext.traceId !== "00000000000000000000000000000000"
    ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
    : {};
}

/** Standard contextual fields — bind them where the ids first exist. */
export interface LogBindings {
  module: string;
  org_id?: string;
  build_id?: string;
  run_id?: string;
  task_id?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface InitLoggerOptions {
  service: string;
  level?: string;
  /** pino-pretty transport — dev only; prod writes raw JSON to stdout. */
  pretty?: boolean;
  /** Test injection: capture lines instead of writing to stdout. */
  stream?: DestinationStream;
}

let root: Logger | undefined;

export function initLogger(options: InitLoggerOptions): Logger {
  const base = {
    name: options.service,
    level: options.level ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    mixin: traceMixin,
    // Errors serialize to type/message/stack only — never the arbitrary
    // properties an SDK error may carry (e.g. Octokit request headers).
    serializers: { err: errSerializer },
  };
  root = options.stream
    ? pino(base, options.stream)
    : options.pretty
      ? pino({ ...base, transport: { target: "pino-pretty" } })
      : pino(base);
  return root;
}

/** The process root logger; a JSON/info fallback until initLogger() runs. */
export function getLogger(): Logger {
  root ??= pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    mixin: traceMixin,
    serializers: { err: errSerializer },
  });
  return root;
}

/** A child of the root carrying standard bindings (`module` at minimum). */
export function childLogger(bindings: LogBindings): Logger {
  return getLogger().child(bindings);
}
