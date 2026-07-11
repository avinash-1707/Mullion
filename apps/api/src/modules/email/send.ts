import { Resend } from "resend";
import { childLogger } from "@mullion/logger";
import { env } from "../../config/env.js";

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const log = childLogger({ module: "email" });

let resendClient: Resend | null = null;

/**
 * Single email seam (ADR-67), driver-selected by EMAIL_DRIVER the same way
 * SANDBOX_DRIVER/ARTIFACT_STORE swap implementations. `console` prints the
 * full message (OTP included) to the local log; `resend` really sends.
 * Production is pinned to resend at env parse time — see env.ts.
 */
export async function sendEmail(args: SendEmailArgs): Promise<void> {
  if (env.EMAIL_DRIVER === "console") {
    // Local dev/test: the OTP has to be readable off the terminal.
    log.info({ to: args.to, subject: args.subject, body: args.text }, "email (console driver)");
    return;
  }
  // env.ts guarantees both are set when EMAIL_DRIVER=resend.
  resendClient ??= new Resend(env.RESEND_API_KEY);
  const { data, error } = await resendClient.emails.send({
    from: env.EMAIL_FROM as string,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
  if (error) {
    // Resend reports API failures in the return value, it does not throw —
    // rethrow so Better Auth surfaces the failure instead of a silent "sent".
    throw new Error(`resend send failed: ${error.name}: ${error.message}`);
  }
  log.info({ to: args.to, id: data?.id }, "email sent");
}
