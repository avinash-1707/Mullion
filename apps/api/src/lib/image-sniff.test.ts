import { describe, expect, it } from "vitest";
import { sniffImageType } from "./image-sniff.js";

function jpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

function png(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function webp(): Buffer {
  // RIFF <size> WEBP
  return Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from("WEBPVP8 ")]);
}

describe("sniffImageType", () => {
  it("recognizes JPEG magic bytes", () => {
    expect(sniffImageType(jpeg())).toBe("jpeg");
  });

  it("recognizes PNG magic bytes", () => {
    expect(sniffImageType(png())).toBe("png");
  });

  it("recognizes WebP (RIFF….WEBP) magic bytes", () => {
    expect(sniffImageType(webp())).toBe("webp");
  });

  it("rejects a text payload renamed to .png (content decides, not the name)", () => {
    expect(sniffImageType(Buffer.from("hello, definitely a png, trust me"))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP (e.g. WAV)", () => {
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from("WAVEfmt ")]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it("rejects empty and too-short buffers", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.from("RIFF"))).toBeNull();
  });

  it("accepts buffers at exactly the minimum signature length", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe("jpeg");
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(
      sniffImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])),
    ).toBe("webp");
  });

  it("rejects GIF (not in the allowed set)", () => {
    expect(sniffImageType(Buffer.from("GIF89a\x01\x00\x01\x00"))).toBeNull();
  });
});
