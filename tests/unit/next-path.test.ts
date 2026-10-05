import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/p/BOB", "/p/BOB"],
    ["/?desde=correo", "/?desde=correo"],
    ["/p/BOB/t/BOB-14#hilo", "/p/BOB/t/BOB-14#hilo"],
  ])("acepta la ruta interna %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["p/BOB"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com/"],
    ["javascript:alert(1)"],
  ])("manda a la portada lo que podría salir del sitio: %s", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });
});
