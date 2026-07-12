import { describe, expect, it } from "vitest";
import type { Db } from "@mullion/db";
import { OpenRouterError } from "@mullion/llm";

/**
 * ADR-70 fail-safes at the unit tier (review finding: these guarantees had
 * zero coverage). config/env parses process.env at import, so the required
 * vars are set BEFORE the dynamic import below.
 */
process.env["NODE_ENV"] ??= "test";
process.env["DATABASE_URL"] ??= "postgres://unit:unit@localhost:5432/unit";
process.env["BETTER_AUTH_SECRET"] ??= "test-secret-at-least-32-characters-long-000";
process.env["API_ORIGIN"] ??= "http://localhost:8787";
process.env["WEB_ORIGIN"] ??= "http://localhost:3000";
process.env["DASHBOARD_ORIGIN"] ??= "http://localhost:3001";
process.env["OPENROUTER_API_KEY"] ??= "test-key";

const byokModule = import("./byok.js");

interface FakeDbCapture {
  updates: Array<{ set: unknown }>;
}

function fakeDb(selectResults: unknown[][], capture: FakeDbCapture = { updates: [] }): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResults.shift() ?? []),
        }),
      }),
    }),
    update: () => ({
      set: (set: unknown) => ({
        where: () => {
          capture.updates.push({ set });
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Db;
}

const context = { organizationId: "org-1" };

describe("byokApiKeyResolver (ADR-70)", () => {
  it("resolves null when the org has no key row", async () => {
    const { byokApiKeyResolver } = await byokModule;
    await expect(byokApiKeyResolver(fakeDb([[]]))(context)).resolves.toBeNull();
  });

  it("resolves null when the key is disabled", async () => {
    const { byokApiKeyResolver } = await byokModule;
    const db = fakeDb([[{ encryptedKey: "irrelevant", enabled: false }]]);
    await expect(byokApiKeyResolver(db)(context)).resolves.toBeNull();
  });

  it("round-trips a key through encryptByokKey and returns it byok-flagged", async () => {
    const { byokApiKeyResolver, encryptByokKey } = await byokModule;
    const encryptedKey = await encryptByokKey("sk-or-v1-round-trip-secret");
    // Ciphertext must not be the plaintext (sanity on the crypto seam).
    expect(encryptedKey).not.toContain("round-trip-secret");
    const db = fakeDb([[{ encryptedKey, enabled: true }]]);
    await expect(byokApiKeyResolver(db)(context)).resolves.toEqual({
      apiKey: "sk-or-v1-round-trip-secret",
      byok: true,
    });
  });

  it("fails safe to platform (null) on undecryptable ciphertext and disables the row", async () => {
    const { byokApiKeyResolver } = await byokModule;
    const capture: FakeDbCapture = { updates: [] };
    const db = fakeDb([[{ encryptedKey: "not-real-ciphertext", enabled: true }]], capture);
    await expect(byokApiKeyResolver(db)(context)).resolves.toBeNull();
    // Deterministic decrypt failure disables the key so it logs once, not
    // once per LLM call (review finding).
    expect(capture.updates[0]).toEqual({ set: { enabled: false } });
  });
});

describe("disableByokKeyOnAuthFailure (ADR-70)", () => {
  it("flips enabled=false for the org", async () => {
    const { disableByokKeyOnAuthFailure } = await byokModule;
    const capture: FakeDbCapture = { updates: [] };
    const db = fakeDb([], capture);
    await disableByokKeyOnAuthFailure(db)(
      context,
      new OpenRouterError({ message: "bad key", status: 401, retryable: false }),
    );
    expect(capture.updates[0]).toEqual({ set: { enabled: false } });
  });
});

describe("getOrgByokStatus (ADR-70)", () => {
  it("returns masked status only — never ciphertext or plaintext", async () => {
    const { getOrgByokStatus } = await byokModule;
    const db = fakeDb([[{ keyLast4: "1a2b", enabled: true }]]);
    await expect(getOrgByokStatus(db, "org-1")).resolves.toEqual({
      hasKey: true,
      keyLast4: "1a2b",
      enabled: true,
    });
  });

  it("reports a keyless org as hasKey=false", async () => {
    const { getOrgByokStatus } = await byokModule;
    await expect(getOrgByokStatus(fakeDb([[]]), "org-1")).resolves.toEqual({
      hasKey: false,
      keyLast4: null,
      enabled: false,
    });
  });
});
