import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { fileHashes } from "@/lib/attachments/hash";

/**
 * PLAN.md §10.3: finalize calcula el mismo md5 y sha1 que node:crypto sobre un fixture conocido.
 * Los valores esperados son los publicados para "abc" (RFC 1321 y FIPS 180), no los recalcula el test.
 */
describe("hash de adjuntos", () => {
  it("md5 y sha1 del fixture 'abc' coinciden con los valores de referencia", () => {
    const bytes = readFileSync(
      path.join(import.meta.dirname, "../fixtures/hash/abc.txt"),
    );
    expect(fileHashes(new Uint8Array(bytes))).toEqual({
      md5: "900150983cd24fb0d6963f7d28e17f72",
      sha1: "a9993e364706816aba3e25717850c26c9cd0d89d",
    });
  });

  it("un archivo vacío también tiene hash", () => {
    expect(fileHashes(new Uint8Array())).toEqual({
      md5: "d41d8cd98f00b204e9800998ecf8427e",
      sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    });
  });
});
