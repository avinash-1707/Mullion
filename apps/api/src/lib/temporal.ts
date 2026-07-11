import { Client, Connection } from "@temporalio/client";
import { OpenTelemetryWorkflowClientInterceptor } from "@temporalio/interceptors-opentelemetry";
import { env } from "../config/env.js";

/**
 * Lazily-connected Temporal client (ADR-10/50). Connect on first build
 * request rather than at boot, so the API still starts when no Temporal
 * dev server is up (planning-only deployments, local dev without a build
 * worker running).
 */
let clientPromise: Promise<Client> | undefined;

export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const connection = await Connection.connect({ address: env.TEMPORAL_ADDRESS });
      return new Client({
        connection,
        namespace: env.TEMPORAL_NAMESPACE,
        // Carries the API request's trace context into the workflow (02 §9)
        // — no-op spans unless the process started OTel.
        interceptors: { workflow: [new OpenTelemetryWorkflowClientInterceptor()] },
      });
    })().catch((error) => {
      // Reset so a later request retries the connection instead of caching
      // a rejected promise forever.
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}
