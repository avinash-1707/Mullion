# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# App split

This is the authenticated product surface (app. subdomain). Marketing,
landing and the auth pages live in `apps/web`; unauthenticated visitors
are redirected there (`src/lib/auth-redirect.ts`). Auth is centralized on
the Hono API — this app never hosts Better Auth itself.
