import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

/** Encodings supported by the response compression helper. */
type Encoding = "gzip" | "br" | "deflate" | "identity";

/** Skip compression for tiny payloads where CPU cost outweighs savings. */
const COMPRESSION_THRESHOLD = 1024;

/** Pick the strongest accepted encoding supported by this service. */
export function negotiateEncoding(acceptEncoding: string | null): Encoding {
  if (!acceptEncoding) {
    return "identity";
  }
  const encodings = acceptEncoding.split(",").map((e) => {
    const parts = e.trim().split(";");
    const name = parts[0]?.trim() ?? "identity";
    const q = parts[1] ? parseFloat(parts[1].replace("q=", "")) : 1;
    return { name: name as Encoding, q };
  });
  encodings.sort((a, b) => b.q - a.q);
  for (const { name } of encodings) {
    if (name === "gzip" || name === "br" || name === "deflate") {
      return name;
    }
  }
  return "identity";
}

/** Compress a response body only when the payload is large enough to justify it. */
export function compressResponse(
  body: string | ArrayBuffer,
  encoding: Encoding,
): { body: Uint8Array; encoding: Encoding } | null {
  if (encoding === "identity") {
    return null;
  }
  const uint8 = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body);
  if (uint8.byteLength < COMPRESSION_THRESHOLD) {
    return null;
  }
  if (encoding === "gzip") {
    return { body: gzipSync(uint8), encoding };
  }
  if (encoding === "br") {
    return { body: brotliCompressSync(uint8), encoding };
  }
  return { body: deflateSync(uint8), encoding };
}
