import { createAuthClient } from "better-auth/react";
import { organizationClient, emailOTPClient, genericOAuthClient } from "better-auth/client/plugins";

// Every request this client makes is cross-origin to the Hono API (separate
// origin/port in dev and prod). better-auth's fetch layer sends credentials
// by default, so no extra CORS/credentials config belongs here — that lives
// on the API side (see docs/specs/02_system_architecture_spec.md §7.1.1).
//
// emailOTPClient() / genericOAuthClient(): the dashboard never signs a user
// in (that's apps/web's job), but the settings surface still needs
// `authClient.listAccounts()`/`linkSocial()`/`unlinkAccount()` shaped
// consistently with the same plugin set as the marketing app so both
// clients infer identical types against the shared server config.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [organizationClient(), emailOTPClient(), genericOAuthClient()],
});
