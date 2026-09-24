/**
 * Magic-byte checks for the upload allowlist (SPEC.md section 27: "file type verification").
 * A declared type passes when the file's first bytes match its format. Formats that share a
 * container are accepted for each other where the bytes cannot tell them apart (WebM audio vs
 * video, MP4 vs M4A, ZIP vs Office documents).
 */
import type { UploadMime } from "@pc/schema";

/** How many leading bytes the checks need. */
export const SNIFF_BYTES = 4096;

type Check = (b: Uint8Array) => boolean;

function ascii(b: Uint8Array, offset: number, text: string): boolean {
  if (b.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) if (b[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

const bytesAt = (b: Uint8Array, offset: number, expected: readonly number[]) =>
  b.length >= offset + expected.length && expected.every((value, i) => b[offset + i] === value);

/** ISO base media (MP4, M4A, HEIC): `ftyp` box at offset 4, then the major brand. */
const ftypBrand = (b: Uint8Array): string | null =>
  ascii(b, 4, "ftyp") && b.length >= 12 ? String.fromCharCode(...b.subarray(8, 12)) : null;

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

const pdf: Check = (b) => {
  // The header may follow up to 1 KB of junk (PDF 1.7, 7.5.2 note).
  const window = b.subarray(0, 1024);
  for (let i = 0; i + 5 <= window.length; i++) if (ascii(window, i, "%PDF-")) return true;
  return false;
};
const png: Check = (b) => bytesAt(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg: Check = (b) => bytesAt(b, 0, [0xff, 0xd8, 0xff]);
const gif: Check = (b) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a");
const webp: Check = (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP");
const wav: Check = (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE");
const heic: Check = (b) => HEIF_BRANDS.has(ftypBrand(b) ?? "");
const mp4: Check = (b) => {
  const brand = ftypBrand(b);
  return brand !== null && !HEIF_BRANDS.has(brand);
};
const webm: Check = (b) => bytesAt(b, 0, [0x1a, 0x45, 0xdf, 0xa3]);
const ogg: Check = (b) => ascii(b, 0, "OggS");
const mp3: Check = (b) =>
  ascii(b, 0, "ID3") || (b.length >= 2 && b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0);
const zip: Check = (b) =>
  bytesAt(b, 0, [0x50, 0x4b, 0x03, 0x04]) || bytesAt(b, 0, [0x50, 0x4b, 0x05, 0x06]);

const CHECKS: Record<UploadMime, Check> = {
  "application/pdf": pdf,
  "image/jpeg": jpeg,
  "image/png": png,
  "image/webp": webp,
  "image/heic": heic,
  "image/gif": gif,
  "audio/webm": webm,
  "audio/ogg": ogg,
  "audio/mpeg": mp3,
  "audio/mp4": mp4,
  "audio/wav": wav,
  "video/mp4": mp4,
  "video/webm": webm,
  "application/zip": zip,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": zip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": zip,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": zip,
};

/** True when the file's first bytes match the declared type. */
export function matchesDeclaredType(declared: UploadMime, firstBytes: Uint8Array): boolean {
  return CHECKS[declared](firstBytes);
}
