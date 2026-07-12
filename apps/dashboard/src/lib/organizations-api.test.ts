import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPersonalOrg,
  orgMemberSchema,
  pendingInviteDisplayStatus,
  roleLabel,
  type OrgInvitation,
} from "./organizations-api";

afterEach(() => {
  vi.useRealTimers();
});

describe("isPersonalOrg", () => {
  it("reads the stringified metadata Postgres stores", () => {
    expect(isPersonalOrg('{"personal":true}')).toBe(true);
    expect(isPersonalOrg('{"personal":false}')).toBe(false);
    expect(isPersonalOrg("{}")).toBe(false);
  });

  it("reads metadata the client SDK hands back already parsed", () => {
    expect(isPersonalOrg({ personal: true })).toBe(true);
    expect(isPersonalOrg({ personal: false })).toBe(false);
    expect(isPersonalOrg({})).toBe(false);
  });

  it("fails closed on absent or malformed metadata", () => {
    expect(isPersonalOrg(null)).toBe(false);
    expect(isPersonalOrg(undefined)).toBe(false);
    expect(isPersonalOrg("not json")).toBe(false);
    // Truthy-but-not-boolean personal must not count.
    expect(isPersonalOrg('{"personal":"yes"}')).toBe(false);
  });
});

describe("pendingInviteDisplayStatus", () => {
  function invitation(expiresAt: string): OrgInvitation {
    return {
      id: "inv-1",
      email: "a@b.c",
      role: "member",
      status: "pending",
      expiresAt,
      createdAt: new Date(0).toISOString(),
    };
  }

  it("derives expired strictly from expiresAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T12:00:00Z"));
    expect(pendingInviteDisplayStatus(invitation("2026-07-12T12:00:01Z"))).toBe("pending");
    expect(pendingInviteDisplayStatus(invitation("2026-07-12T11:59:59Z"))).toBe("expired");
  });
});

describe("roleLabel", () => {
  it("labels both v1 roles", () => {
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("member")).toBe("Member");
  });
});

describe("orgMemberSchema role coercion (ADR-72 migration window)", () => {
  const row = {
    id: "m1",
    userId: "u1",
    name: "Ada",
    email: "ada@acme.dev",
    image: null,
    createdAt: new Date(0).toISOString(),
  };

  it("coerces legacy owner rows to admin instead of failing the parse", () => {
    expect(orgMemberSchema.parse({ ...row, role: "owner" }).role).toBe("admin");
    expect(orgMemberSchema.parse({ ...row, role: "member" }).role).toBe("member");
  });

  it("still rejects unknown roles", () => {
    expect(() => orgMemberSchema.parse({ ...row, role: "superuser" })).toThrow();
  });
});
