export type OtpEmailType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<OtpEmailType, { subject: string; lead: string; note?: string }> = {
  "sign-in": {
    subject: "Your Mullion sign-in code",
    lead: "Use this code to sign in to Mullion:",
  },
  "email-verification": {
    subject: "Verify your Mullion email",
    lead: "Use this code to verify your email address:",
  },
  // Set-or-reset neutral (ADR-68): forgot-password is the one recovery door,
  // and for a social-first account this same flow creates their first
  // password — the copy must read correctly for both.
  "forget-password": {
    subject: "Your Mullion account code",
    lead: "Use this code to choose a new password for your Mullion account:",
    note: "If you signed up with Google or GitHub and never set a password, this code lets you create one. Your Google or GitHub sign-in keeps working either way. We'll never ask you for this code.",
  },
  "change-email": {
    subject: "Confirm your new Mullion email",
    lead: "Use this code to confirm your email change:",
  },
};

/**
 * Plain, unbranded invite email (same ADR-67 posture as the OTP mails).
 * The accept URL carries only the invitation id — acceptance still requires
 * a signed-in session whose email matches the invitation (ADR-72).
 */
export function renderInviteEmail(params: {
  orgName: string;
  inviterName: string;
  acceptUrl: string;
}): RenderedEmail {
  const { orgName, inviterName, acceptUrl } = params;
  const subject = `${inviterName} invited you to ${orgName} on Mullion`;
  const lead = `${inviterName} invited you to join ${orgName} on Mullion. Open this link to accept:`;
  const tail = "This invitation expires in 48 hours. If you weren't expecting it, ignore this email.";
  const text = [lead, acceptUrl, tail].join("\n\n");
  const html = [
    `<p>${lead}</p>`,
    `<p><a href="${acceptUrl}">${acceptUrl}</a></p>`,
    `<p>${tail}</p>`,
  ].join("\n");
  return { subject, text, html };
}

/**
 * Plain, unbranded OTP email (branded/i18n templates deliberately deferred,
 * ADR-67). The OTP is the whole message — expiry and single-purpose framing
 * so a phished code is at least time-boxed.
 */
export function renderOtpEmail(type: OtpEmailType, otp: string): RenderedEmail {
  const { subject, lead, note } = COPY[type];
  const tail = "This code expires in 5 minutes. If you didn't request it, ignore this email.";
  const text = [lead, otp, ...(note ? [note] : []), tail].join("\n\n");
  const html = [
    `<p>${lead}</p>`,
    `<p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p>`,
    ...(note ? [`<p>${note}</p>`] : []),
    `<p>${tail}</p>`,
  ].join("\n");
  return { subject, text, html };
}
