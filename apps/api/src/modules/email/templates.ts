export type OtpEmailType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<OtpEmailType, { subject: string; lead: string }> = {
  "sign-in": {
    subject: "Your Mullion sign-in code",
    lead: "Use this code to sign in to Mullion:",
  },
  "email-verification": {
    subject: "Verify your Mullion email",
    lead: "Use this code to verify your email address:",
  },
  "forget-password": {
    subject: "Reset your Mullion password",
    lead: "Use this code to reset your password:",
  },
  "change-email": {
    subject: "Confirm your new Mullion email",
    lead: "Use this code to confirm your email change:",
  },
};

/**
 * Plain, unbranded OTP email (branded/i18n templates deliberately deferred,
 * ADR-67). The OTP is the whole message — expiry and single-purpose framing
 * so a phished code is at least time-boxed.
 */
export function renderOtpEmail(type: OtpEmailType, otp: string): RenderedEmail {
  const { subject, lead } = COPY[type];
  const text = `${lead}\n\n${otp}\n\nThis code expires in 5 minutes. If you didn't request it, ignore this email.`;
  const html = [
    `<p>${lead}</p>`,
    `<p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p>`,
    `<p>This code expires in 5 minutes. If you didn't request it, ignore this email.</p>`,
  ].join("\n");
  return { subject, text, html };
}
