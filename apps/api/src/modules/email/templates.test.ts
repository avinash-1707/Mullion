import { describe, expect, it } from "vitest";
import { renderOtpEmail, type OtpEmailType } from "./templates.js";

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
});
