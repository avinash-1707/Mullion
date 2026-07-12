import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

/**
 * Avatar storage on Cloudinary (ADR-73). Server-side only — the API secret
 * never reaches a browser; the dashboard talks to POST /api/account/avatar
 * and this module talks to Cloudinary with a signed request.
 *
 * public_id is the authenticated user id (deterministic + overwrite): each
 * user owns exactly one avatar asset, a new upload replaces the old one, so
 * no orphan-cleanup job ever exists. `invalidate` purges CDN copies of the
 * reused id; the versioned secure_url we store busts browser caches.
 */

export class CloudinaryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CloudinaryError";
  }
}

export function isAvatarUploadConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

let configured = false;
function configuredClient(): typeof cloudinary {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      // Routes gate on isAvatarUploadConfigured() (503) before calling in —
      // reaching here without creds is a programming error, not a user one.
      throw new CloudinaryError("Cloudinary credentials are not configured");
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

// public_id isolation between users rests entirely on the id's shape — a
// slash or ".." in a future id scheme would re-path the asset out of the
// user's slot. Better Auth ids are url-safe alphanumerics today; pin it.
function assertSafePublicId(userId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
    throw new CloudinaryError("User id is not a safe Cloudinary public_id");
  }
}

export async function uploadAvatar(buffer: Buffer, userId: string): Promise<{ imageUrl: string }> {
  assertSafePublicId(userId);
  const client = configuredClient();
  const result = await new Promise<{ secure_url?: string } | undefined>((resolve, reject) => {
    client.uploader
      .upload_stream(
        {
          public_id: userId,
          folder: "avatars",
          overwrite: true,
          invalidate: true,
          transformation: [
            { width: 256, height: 256, crop: "fill", gravity: "face" },
            // Delivery-time negotiation baked into the stored URL — every
            // request against it gets per-browser format/quality.
            { quality: "auto", fetch_format: "auto" },
          ],
        },
        (error, uploadResult) => {
          if (error) {
            reject(new CloudinaryError("Avatar upload failed", { cause: error }));
            return;
          }
          resolve(uploadResult);
        },
      )
      .end(buffer);
  });
  if (!result?.secure_url) {
    throw new CloudinaryError("Avatar upload returned no URL");
  }
  return { imageUrl: result.secure_url };
}

export async function deleteAvatar(userId: string): Promise<void> {
  assertSafePublicId(userId);
  const client = configuredClient();
  let result: { result?: string };
  try {
    result = (await client.uploader.destroy(`avatars/${userId}`, {
      resource_type: "image",
      invalidate: true,
    })) as { result?: string };
  } catch (error) {
    throw new CloudinaryError("Avatar delete failed", { cause: error });
  }
  // "not found" is fine — the user may never have uploaded one (their image
  // could be an OAuth avatar), and remove should still clear the DB field.
  if (result.result !== "ok" && result.result !== "not found") {
    throw new CloudinaryError(`Avatar delete failed: ${result.result ?? "unknown"}`);
  }
}
