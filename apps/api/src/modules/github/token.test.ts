import { describe, expect, it, vi } from "vitest";

// The token helpers read Better Auth's `account` row. Mock the db module so
// no real Postgres is needed for the pure parsing/null-handling logic.
vi.mock("../../lib/db.js", () => ({ db: {} }));

const rows: unknown[] = [];
vi.mock("@mullion/db", () => ({
  schema: { account: { accessToken: "access_token", scope: "scope", userId: "user_id", providerId: "provider_id" } },
}));

// Rebuild a minimal db surface the helpers use: select().from().where().limit().
async function load(row: { accessToken: string | null; scope: string | null } | undefined) {
  vi.resetModules();
  vi.doMock("../../lib/db.js", () => ({
    db: {
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }),
      }),
    },
  }));
  return import("./token.js");
}

void rows;

describe("getGitHubConnection", () => {
  it("reports connected + parsed scopes", async () => {
    const { getGitHubConnection } = await load({ accessToken: "tok", scope: "repo, read:user" });
    expect(await getGitHubConnection("u")).toEqual({ connected: true, scopes: ["repo", "read:user"] });
  });

  it("reports disconnected with no row", async () => {
    const { getGitHubConnection } = await load(undefined);
    expect(await getGitHubConnection("u")).toEqual({ connected: false, scopes: [] });
  });

  it("handles a null token / empty scope", async () => {
    const { getGitHubConnection } = await load({ accessToken: null, scope: null });
    expect(await getGitHubConnection("u")).toEqual({ connected: false, scopes: [] });
  });
});

describe("getGitHubAccessToken", () => {
  it("returns the token or null", async () => {
    const { getGitHubAccessToken } = await load({ accessToken: "tok", scope: "repo" });
    expect(await getGitHubAccessToken("u")).toBe("tok");
    const { getGitHubAccessToken: none } = await load(undefined);
    expect(await none("u")).toBeNull();
  });
});
