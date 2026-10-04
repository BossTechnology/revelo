import { expect, it } from "vitest";

// Test huérfano a propósito: ningún job lo ejecuta. ci-coverage debe fallar.
it("nadie me corre", () => {
  expect(true).toBe(true);
});
