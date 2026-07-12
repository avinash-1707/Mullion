import { describe, expect, it } from "vitest";
import { renderInviteEmail, renderOtpEmail, type OtpEmailType } from "./templates.js";

const TYPES: OtpEmailType[] = ["sign-in", "email-verification", "forget-password", "change-email"];

describe("renderOtpEmail", () => {
  it("puts the OTP in both bodies for every type, with a distinct subject", () => {
    const subjects = new Set<string>();
    for (const type of TYPES) {
      const { subject, text, html } = renderOtpEmail(type, "123456");
      expect(text).toContain("123456");
      expect(html).toContain("123456");
      // Expiry + ignore-this-email framing must survive in BOTH bodies —
      // most clients render only one of them.
      for (const rendered of [text, html]) {
        expect(rendered).toContain("expires");
        expect(rendered).toContain("ignore this email");
      }
      subjects.add(subject);
    }
    expect(subjects.size).toBe(TYPES.length);
  });

  it("carries the set-or-reset note only in the forget-password email (ADR-68)", () => {
    // The note teaches social-first users what the code does and carries the
    // anti-phishing line — it must survive in BOTH bodies, and must not
    // bleed into the other email types.
    const { text, html } = renderOtpEmail("forget-password", "123456");
    for (const rendered of [text, html]) {
      expect(rendered).toContain("never set a password");
      expect(rendered).toContain("never ask you for this code");
    }
    for (const type of TYPES.filter((t) => t !== "forget-password")) {
      const other = renderOtpEmail(type, "123456");
      for (const rendered of [other.text, other.html]) {
        expect(rendered).not.toContain("never ask you for this code");
      }
    }
  });
});

describe("renderInviteEmail (ADR-72)", () => {
  const rendered = renderInviteEmail({
    orgName: "Acme",
    inviterName: "Ada",
    acceptUrl: "http://localhost:3001/invite/inv-123",
  });

  it("names the inviter and org in the subject", () => {
    expect(rendered.subject).toContain("Ada");
    expect(rendered.subject).toContain("Acme");
  });

  it("carries the accept URL in both bodies", () => {
    expect(rendered.text).toContain("http://localhost:3001/invite/inv-123");
    expect(rendered.html).toContain('href="http://localhost:3001/invite/inv-123"');
  });

  it("states the 48h expiry and the ignore framing", () => {
    for (const body of [rendered.text, rendered.html]) {
      expect(body).toContain("48 hours");
      expect(body).toContain("ignore this email");
    }
  });
});
