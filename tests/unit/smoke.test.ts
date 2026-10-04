import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("humo: unit", () => {
  it("resuelve el alias @ y combina clases con cn()", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
