import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Driver behavior for the sendEmail seam (ADR-67). env parses process.env at
 * module load, so each case resets modules and re-imports with the driver it
 * needs — the same pattern the integration harness uses for boot.
 */

const BASE_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  API_ORIGIN: "http://localhost:8787",
  WEB_ORIGIN: "http://localhost:3000",
  DASHBOARD_ORIGIN: "http://localhost:3001",
  OPENROUTER_API_KEY: "test-key",
};

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const ARGS = { to: "user@example.com", subject: "Test", text: "code 123456", html: "<p>123456</p>" };

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  vi.resetModules();
  sendMock.mockReset();
});

afterEach(() => {
  process.env = savedEnv;
});

// Wipes the LIVE process.env — safe only because vitest's default `forks`
// pool isolates each test FILE in its own process. If the pool ever moves to
// threads/isolate:false, switch this to vi.stubEnv.
function applyEnv(extra: Record<string, string>): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE_ENV, extra);
}

describe("sendEmail", () => {
  it("console driver logs the full message (OTP readable) and never touches resend", async () => {
    applyEnv({ EMAIL_DRIVER: "console" });
    const lines: string[] = [];
    // resetModules gave send.js a FRESH logger module — initialize that
    // instance (a static import would configure the stale original).
    const { initLogger } = await import("@mullion/logger");
    initLogger({ service: "test-api", level: "info", stream: { write: (l: string) => void lines.push(l) } });
    const { sendEmail } = await import("./send.js");
    await sendEmail(ARGS);
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const mail = logged.find((l) => l["module"] === "email");
    expect(mail).toMatchObject({ to: ARGS.to, subject: ARGS.subject, body: ARGS.text });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("resend driver throws when the API reports an error (resend does not throw itself)", async () => {
    applyEnv({ EMAIL_DRIVER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Mullion <auth@mullion.dev>" });
    sendMock.mockResolvedValue({ data: null, error: { name: "validation_error", message: "bad from" } });
    const { sendEmail } = await import("./send.js");
    await expect(sendEmail(ARGS)).rejects.toThrow(/resend send failed.*validation_error/);
  });

  it("resend driver passes from/to/subject/bodies through on success", async () => {
    applyEnv({ EMAIL_DRIVER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Mullion <auth@mullion.dev>" });
    sendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
    const { sendEmail } = await import("./send.js");
    await sendEmail(ARGS);
    expect(sendMock).toHaveBeenCalledWith({
      from: "Mullion <auth@mullion.dev>",
      to: ARGS.to,
      subject: ARGS.subject,
      text: ARGS.text,
      html: ARGS.html,
    });
  });
});
