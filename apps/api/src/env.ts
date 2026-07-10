import { parseApiEnv } from "@mullion/config/env";

// Fails the boot loudly on a missing/malformed var (CODING_STANDARDS §7).
export const env = parseApiEnv(process.env);
