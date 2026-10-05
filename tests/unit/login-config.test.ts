import { afterEach, describe, expect, it } from "vitest";

import { magicLinkEnabled } from "@/app/(auth)/login/config";

describe("RELEVO_MAGIC_LINK", () => {
  const original = process.env.RELEVO_MAGIC_LINK;
  afterEach(() => {
    if (original === undefined) delete process.env.RELEVO_MAGIC_LINK;
    else process.env.RELEVO_MAGIC_LINK = original;
  });

  it("por defecto el enlace mágico está activo (local y tests)", () => {
    delete process.env.RELEVO_MAGIC_LINK;
    expect(magicLinkEnabled()).toBe(true);
  });
  it("con 'off' se apaga (entornos sin SMTP: solo Google)", () => {
    process.env.RELEVO_MAGIC_LINK = "off";
    expect(magicLinkEnabled()).toBe(false);
  });
});
