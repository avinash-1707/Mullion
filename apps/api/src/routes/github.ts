import { Hono } from "hono";
import { requireOrgMember, type RequiredAuthVariables } from "../middleware/session.js";
import { getGitHubConnection } from "../github/token.js";

/**
 * GitHub connection status (ADR-56). The link itself happens via Better
 * Auth's /api/auth/link-social from the web app; this just reports whether a
 * repo-scoped token is present, so the UI can offer GitHub delivery.
 */
export const githubRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)
  .get("/connection", async (c) => {
    const user = c.get("user");
    return c.json(await getGitHubConnection(user.id));
  });
