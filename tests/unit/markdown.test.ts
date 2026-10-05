import { describe, expect, it } from "vitest";

import { toggleChecklistItem } from "@/lib/relevo/markdown";

const body = `## Report-back

- [x] Archivos aplicados
- [ ] 77 tests en verde
* [ ] PR mergeado

Texto - [ ] que no es casilla`;

describe("toggleChecklistItem", () => {
  it("marca la casilla pedida y deja las demás", () => {
    const out = toggleChecklistItem(body, 1);
    expect(out).toContain("- [x] 77 tests en verde");
    expect(out).toContain("- [x] Archivos aplicados");
    expect(out).toContain("* [ ] PR mergeado");
  });
  it("desmarca una casilla marcada", () => {
    expect(toggleChecklistItem(body, 0)).toContain("- [ ] Archivos aplicados");
  });
  it("cuenta también listas con * y numeradas, e ignora texto que no es lista", () => {
    expect(toggleChecklistItem(body, 2)).toContain("* [x] PR mergeado");
    expect(toggleChecklistItem(body, 3)).toBe(body);
  });
});
