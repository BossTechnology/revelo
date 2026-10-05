import { createVerify, generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { appJwt } from "@/lib/github/app";

describe("JWT de la GitHub App", () => {
  it("firma RS256 verificable con la clave pública, con iss, iat y exp de menos de 10 minutos", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const jwt = appJwt("123456", pem, 1_800_000_000);
    const [header, payload, signature] = jwt.split(".") as [
      string,
      string,
      string,
    ];

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims).toEqual({
      iss: "123456",
      iat: 1_800_000_000 - 60,
      exp: 1_800_000_000 + 540,
    });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    expect(
      verifier.verify(publicKey, Buffer.from(signature, "base64url")),
    ).toBe(true);
  });

  it("acepta la clave con \\n escapados (como queda en una variable de entorno)", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey
      .export({ type: "pkcs1", format: "pem" })
      .toString()
      .replace(/\n/g, "\\n");
    expect(() => appJwt("1", pem)).not.toThrow();
  });
});
