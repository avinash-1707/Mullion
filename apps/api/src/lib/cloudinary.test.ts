import { beforeEach, describe, expect, it, vi } from "vitest";

// The SDK is mocked at the module boundary (no cassette system exists for
// Cloudinary) — these tests pin the contract our wrapper sends: deterministic
// public_id from the user id, overwrite semantics, and error mapping.
const uploadStream = vi.hoisted(() => vi.fn());
const destroy = vi.hoisted(() => vi.fn());

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload_stream: uploadStream, destroy },
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret",
  },
}));

const { CloudinaryError, deleteAvatar, isAvatarUploadConfigured, uploadAvatar } = await import("./cloudinary.js");

type UploadCallback = (error: unknown, result?: { secure_url?: string }) => void;

function mockUploadResult(error: unknown, result?: { secure_url?: string }) {
  uploadStream.mockImplementation((_opts: unknown, callback: UploadCallback) => ({
    end: () => callback(error, result),
  }));
}

beforeEach(() => {
  uploadStream.mockReset();
  destroy.mockReset();
});

describe("isAvatarUploadConfigured", () => {
  it("is true when the full credential triple is present", () => {
    expect(isAvatarUploadConfigured()).toBe(true);
  });
});

describe("uploadAvatar", () => {
  it("uploads with public_id = user id, overwrite + invalidate, face-crop transform", async () => {
    mockUploadResult(null, { secure_url: "https://res.cloudinary.com/test-cloud/avatars/u1.jpg" });

    const { imageUrl } = await uploadAvatar(Buffer.from("fake"), "u1");

    expect(imageUrl).toBe("https://res.cloudinary.com/test-cloud/avatars/u1.jpg");
    const options = uploadStream.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options["public_id"]).toBe("u1");
    expect(options["folder"]).toBe("avatars");
    expect(options["overwrite"]).toBe(true);
    expect(options["invalidate"]).toBe(true);
    expect(options["transformation"]).toEqual([
      { width: 256, height: 256, crop: "fill", gravity: "face" },
      { quality: "auto", fetch_format: "auto" },
    ]);
  });

  it("maps an SDK error to CloudinaryError", async () => {
    mockUploadResult(new Error("network down"));
    await expect(uploadAvatar(Buffer.from("fake"), "u1")).rejects.toBeInstanceOf(CloudinaryError);
  });

  it("treats a result without secure_url as an error", async () => {
    mockUploadResult(null, {});
    await expect(uploadAvatar(Buffer.from("fake"), "u1")).rejects.toBeInstanceOf(CloudinaryError);
  });
});

describe("deleteAvatar", () => {
  it("destroys the deterministic avatars/<userId> asset with invalidate", async () => {
    destroy.mockResolvedValue({ result: "ok" });
    await deleteAvatar("u1");
    expect(destroy).toHaveBeenCalledWith("avatars/u1", { resource_type: "image", invalidate: true });
  });

  it("tolerates 'not found' (OAuth avatars were never hosted by us)", async () => {
    destroy.mockResolvedValue({ result: "not found" });
    await expect(deleteAvatar("u1")).resolves.toBeUndefined();
  });

  it("maps any other outcome to CloudinaryError", async () => {
    destroy.mockResolvedValue({ result: "error" });
    await expect(deleteAvatar("u1")).rejects.toBeInstanceOf(CloudinaryError);
  });

  it("maps an SDK throw to CloudinaryError", async () => {
    destroy.mockRejectedValue(new Error("boom"));
    await expect(deleteAvatar("u1")).rejects.toBeInstanceOf(CloudinaryError);
  });
});
