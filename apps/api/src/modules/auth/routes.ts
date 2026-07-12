import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { and, eq, isNotNull } from "drizzle-orm";
import { schema } from "@mullion/db";
import { db } from "../../lib/db.js";
import { CloudinaryError, deleteAvatar, isAvatarUploadConfigured, uploadAvatar } from "../../lib/cloudinary.js";
import { sniffImageType } from "../../lib/image-sniff.js";
import { requireOrgMember, type RequiredAuthVariables } from "../../middleware/session.js";
import { auth } from "./auth.js";

const setPasswordSchema = z.object({
  newPassword: z.string().min(8).max(256),
});

// Server truth for avatar size — the dashboard's 5MB client check is UX only.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Every upload is an outbound Cloudinary round trip — tighter than the
// global per-user window, mirroring byokSaveRateLimit's posture (ADR-73).
const avatarUploadRateLimit = rateLimiter<{ Variables: RequiredAuthVariables }>({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  keyGenerator: (c) => `avatar:${c.get("user").id}`,
});

/**
 * Account self-service beyond what Better Auth exposes over HTTP.
 * set-password lets a social-first account (no credential row — the empty
 * password field is the flag, ADR-66) add a password from an authenticated
 * session. Accounts that already have one must use change-password (which
 * demands the current password) — a session alone must never be enough to
 * ROTATE a password, only to create a first one.
 */
export const accountRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)
  .post("/set-password", zValidator("json", setPasswordSchema), async (c) => {
    const user = c.get("user");
    const existing = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, user.id),
          eq(schema.account.providerId, "credential"),
          isNotNull(schema.account.password),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new HTTPException(409, {
        message: "Account already has a password — use change password.",
      });
    }
    const { newPassword } = c.req.valid("json");
    await auth.api.setPassword({
      body: { newPassword },
      headers: c.req.raw.headers,
    });
    return c.json({ ok: true });
  })

  /**
   * Avatar upload (ADR-73): multipart file in, Cloudinary secure_url written
   * to user.image server-side. The client never supplies a URL — public_id
   * derives from the session user id, so nobody can overwrite anyone else's
   * asset, and the browser's MIME/filename claims are ignored in favor of
   * magic-byte sniffing.
   */
  .post(
    "/avatar",
    avatarUploadRateLimit,
    bodyLimit({
      // Slightly above MAX_AVATAR_BYTES: multipart framing adds overhead, and
      // the post-parse file.size check below is the real per-file limit.
      maxSize: 6 * 1024 * 1024,
      onError: () => {
        throw new HTTPException(413, { message: "Avatar must be 5MB or smaller" });
      },
    }),
    async (c) => {
      if (!isAvatarUploadConfigured()) {
        throw new HTTPException(503, { message: "Avatar uploads are not configured" });
      }
      const user = c.get("user");
      const formData = await c.req.formData().catch(() => null);
      const file = formData?.get("avatar");
      if (!(file instanceof File)) {
        throw new HTTPException(400, { message: "Send the image as multipart field 'avatar'" });
      }
      if (file.size > MAX_AVATAR_BYTES) {
        throw new HTTPException(413, { message: "Avatar must be 5MB or smaller" });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!sniffImageType(buffer)) {
        throw new HTTPException(400, { message: "Avatar must be a JPEG, PNG, or WebP image" });
      }
      let imageUrl: string;
      try {
        ({ imageUrl } = await uploadAvatar(buffer, user.id));
      } catch (error) {
        if (error instanceof CloudinaryError) {
          throw new HTTPException(502, { message: "Avatar upload failed — try again" });
        }
        throw error;
      }
      await auth.api.updateUser({
        body: { image: imageUrl },
        headers: c.req.raw.headers,
      });
      return c.json({ image: imageUrl });
    },
  )

  /**
   * Remove avatar: clears user.image (falls back to initials in the UI) and
   * best-effort deletes the Cloudinary asset. "not found" is expected — the
   * current image may be an OAuth avatar we never hosted.
   */
  .delete("/avatar", avatarUploadRateLimit, async (c) => {
    const user = c.get("user");
    if (isAvatarUploadConfigured()) {
      try {
        await deleteAvatar(user.id);
      } catch {
        // The DB field is the source of truth for what renders; a failed
        // CDN delete must not keep a removed avatar on screen. The asset is
        // reused (public_id = user id), so the next upload overwrites it.
      }
    }
    await auth.api.updateUser({
      body: { image: null },
      headers: c.req.raw.headers,
    });
    return c.json({ ok: true });
  });
