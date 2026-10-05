import { createHash } from "node:crypto";

/** md5 y sha1 en hexadecimal, calculados en el servidor con node:crypto (PLAN.md §8). */
export function fileHashes(bytes: Uint8Array): { md5: string; sha1: string } {
  return {
    md5: createHash("md5").update(bytes).digest("hex"),
    sha1: createHash("sha1").update(bytes).digest("hex"),
  };
}
