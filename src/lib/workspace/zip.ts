/**
 * Minimal, dependency-free ZIP writer (STORE method — no compression).
 *
 * Bot projects are a handful of small text files, so compression buys little and
 * a real zip library is overkill. This builds a valid .zip (local file headers +
 * central directory + end record) entirely in the browser and returns a Blob.
 */
import type { ProjectFile } from "./types";

// ---- CRC-32 (standard polynomial, table-driven) ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// DOS date/time — fixed timestamp keeps output deterministic and valid.
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

/** Build a .zip Blob from the project's files. */
export function zipFiles(files: ProjectFile[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const size = data.length;

    // Local file header
    const local = concat([
      u32(0x04034b50), // signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(size), // compressed size
      u32(size), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra length
      nameBytes,
      data,
    ]);
    chunks.push(local);

    // Central directory record
    central.push(
      concat([
        u32(0x02014b50), // signature
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(0), // method
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk number
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
        nameBytes,
      ]),
    );

    offset += local.length;
  }

  const centralStart = offset;
  const centralBytes = concat(central);
  const end = concat([
    u32(0x06054b50), // end of central dir signature
    u16(0), // disk
    u16(0), // disk with central dir
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(centralStart),
    u16(0), // comment length
  ]);

  const parts = [concat(chunks), centralBytes, end] as unknown as BlobPart[];
  return new Blob(parts, { type: "application/zip" });
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Build a zip and trigger a browser download named after the project. */
export function downloadZip(name: string, files: ProjectFile[]): void {
  const blob = zipFiles(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "bot"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
