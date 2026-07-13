import { Buffer } from "node:buffer";
import { z } from "zod";

/**
 * Opaque keyset cursor for the builds list (ADR-77): base64url of
 * `${createdAt.toISOString()}_${id}`. Opaque so clients can't build one by
 * hand and grow a dependency on its internals — the server decodes and
 * zod-validates it, and anything malformed answers 400, never a 500.
 */

// The "_" separator can't collide: an ISO timestamp contains none, and the
// uuid after the first "_" is validated as such below.
const cursorPayloadSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string().uuid(),
});

export interface BuildsCursor {
  createdAt: Date;
  id: string;
}

export function encodeBuildsCursor(row: BuildsCursor): string {
  return Buffer.from(`${row.createdAt.toISOString()}_${row.id}`, "utf8").toString("base64url");
}

/** Null on anything that isn't a well-formed cursor — the caller maps that to 400. */
export function decodeBuildsCursor(raw: string): BuildsCursor | null {
  // Buffer.from(base64url) never throws — garbage just decodes to garbage,
  // which the schema parse below rejects.
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const separator = decoded.indexOf("_");
  if (separator === -1) return null;
  const parsed = cursorPayloadSchema.safeParse({
    createdAt: decoded.slice(0, separator),
    id: decoded.slice(separator + 1),
  });
  if (!parsed.success) return null;
  return { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id };
}
