import type { UploadMime } from "@pc/schema";
import { describe, expect, it } from "vitest";

import { matchesDeclaredType } from "./file-types";

const text = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...text(p)] : p)));
const ftyp = (brand: string) => bytes([0, 0, 0, 0x18], "ftyp", brand, [0, 0, 0, 0]);

const SAMPLES: Record<UploadMime, Uint8Array> = {
  "application/pdf": text("%PDF-1.7\n%âãÏÓ"),
  "image/jpeg": bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], "JFIF"),
  "image/png": bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "),
  "image/heic": ftyp("heic"),
  "image/gif": text("GIF89a"),
  "audio/webm": bytes([0x1a, 0x45, 0xdf, 0xa3]),
  "audio/ogg": text("OggS"),
  "audio/mpeg": text("ID3\x04"),
  "audio/mp4": ftyp("M4A "),
  "audio/wav": bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt "),
  "video/mp4": ftyp("isom"),
  "video/webm": bytes([0x1a, 0x45, 0xdf, 0xa3]),
  "application/zip": bytes([0x50, 0x4b, 0x03, 0x04]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": bytes([
    0x50, 0x4b, 0x03, 0x04,
  ]),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": bytes([
    0x50, 0x4b, 0x03, 0x04,
  ]),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": bytes([
    0x50, 0x4b, 0x03, 0x04,
  ]),
};

describe("matchesDeclaredType", () => {
  for (const [mime, sample] of Object.entries(SAMPLES) as [UploadMime, Uint8Array][]) {
    it(`accepts real ${mime}`, () => {
      expect(matchesDeclaredType(mime, sample)).toBe(true);
    });
  }

  it("rejects a PDF declared as an image, and an HTML page declared as a PDF", () => {
    expect(matchesDeclaredType("image/png", SAMPLES["application/pdf"])).toBe(false);
    expect(matchesDeclaredType("application/pdf", text("<!doctype html><script>"))).toBe(false);
  });

  it("finds a PDF header after leading junk, but only within the first 1 KB", () => {
    expect(matchesDeclaredType("application/pdf", text(`${" ".repeat(500)}%PDF-1.4`))).toBe(true);
    expect(matchesDeclaredType("application/pdf", text(`${" ".repeat(1100)}%PDF-1.4`))).toBe(false);
  });

  it("tells HEIC apart from MP4 by the brand", () => {
    expect(matchesDeclaredType("video/mp4", SAMPLES["image/heic"])).toBe(false);
    expect(matchesDeclaredType("image/heic", SAMPLES["video/mp4"])).toBe(false);
  });

  it("accepts MP3 frames without an ID3 tag", () => {
    expect(matchesDeclaredType("audio/mpeg", bytes([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
  });

  it("rejects empty and truncated files", () => {
    expect(matchesDeclaredType("image/png", new Uint8Array())).toBe(false);
    expect(matchesDeclaredType("image/png", bytes([0x89, 0x50]))).toBe(false);
  });
});
