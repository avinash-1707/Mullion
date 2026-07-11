import { childLogger } from "@mullion/logger";

/**
 * undici's Request.clone() intermittently throws `TypeError: unusable` when a
 * body-bearing Request is cloned while its ReadableStream is in a teed or
 * disturbed state. better-auth trips this on every credential flow: sign-up
 * (sign-up.mjs:249), the requireEmailVerification re-send on sign-in, and
 * change-email all evaluate `ctx.request?.clone()` to pass the request as an
 * OPTIONAL context arg to sendVerificationEmail. better-call has already
 * cloned the incoming request once to parse the JSON body, so this is a
 * second clone of an already-teed stream — its success is GC/event-loop
 * timing dependent, which is why it only surfaced under integration-suite
 * load (ADR-69).
 *
 * Our emailOTP sendVerificationOTP({ email, otp, type }) ignores the request
 * arg entirely, so a failed clone is inconsequential: fall back to the
 * original request. This is NOT a retry and masks no product regression — it
 * changes behavior only where native clone would have thrown, and anything
 * other than the exact "unusable" TypeError still throws.
 */
let warned = false;
const nativeClone = Request.prototype.clone;
// The lib.dom type marks clone read-only; the runtime property is a plain
// configurable method, so defineProperty is the honest way through.
Object.defineProperty(Request.prototype, "clone", {
  configurable: true,
  writable: true,
  value: function cloneOrSelf(this: Request): Request {
    try {
      return nativeClone.call(this);
    } catch (err) {
      if (err instanceof TypeError && err.message === "unusable") {
        if (!warned) {
          warned = true;
          childLogger({ module: "undici-clone-guard" }).warn(
            "Request.clone() threw 'unusable'; returned original request (clone arg is unused by sendVerificationOTP)",
          );
        }
        return this;
      }
      throw err;
    }
  },
});
