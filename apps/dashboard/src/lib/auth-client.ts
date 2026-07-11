import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// Every request this client makes is cross-origin to the Hono API (separate
// origin/port in dev and prod). better-auth's fetch layer sends credentials
// by default, so no extra CORS/credentials config belongs here — that lives
// on the API side (see docs/specs/02_system_architecture_spec.md §7.1.1).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [organizationClient()],
});
