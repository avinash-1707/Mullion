import { describe, expect, it } from "vitest";
import { assertOrgRole } from "../org.js";

describe("assertOrgRole (ADR-72)", () => {
  it("accepts the two v1 roles", () => {
    expect(() => assertOrgRole("admin")).not.toThrow();
    expect(() => assertOrgRole("member")).not.toThrow();
  });

  it("rejects the retired owner role", () => {
    expect(() => assertOrgRole("owner")).toThrow();
  });

  it("rejects comma-joined role lists (parseRoles smuggling)", () => {
    expect(() => assertOrgRole("admin,member")).toThrow();
    expect(() => assertOrgRole("member,owner")).toThrow();
  });

  it("rejects empty and unknown roles", () => {
    expect(() => assertOrgRole("")).toThrow();
    expect(() => assertOrgRole("superuser")).toThrow();
    expect(() => assertOrgRole("Admin")).toThrow();
  });
});
