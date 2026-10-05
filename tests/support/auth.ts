import { expect, type Page } from "@playwright/test";

import { latestLinkTo, latestMessageId } from "./mailpit";
import { adminClient } from "./supabase";

export const NEUTRAL_MESSAGE =
  "Si tu correo está invitado, te llegó un enlace para entrar.";

/**
 * Pide el enlace mágico desde /login (la página ya tiene que estar abierta). Devuelve el ID del
 * correo anterior, para que waitForMagicLink espere uno nuevo.
 */
export async function requestMagicLink(page: Page, email: string) {
  const previous = await latestMessageId(email);
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("button", { name: "Enviarme un enlace" }).click();
  await expect(page.getByRole("status")).toContainText(NEUTRAL_MESSAGE);
  return previous;
}

/** Espera un enlace más nuevo que `previous` en el buzón de `email`. */
export async function waitForMagicLink(
  email: string,
  previous?: string | null,
): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(async () => (link = await latestLinkTo(email, previous)), {
      timeout: 15_000,
    })
    .not.toBeNull();
  return link!;
}

export async function openMagicLink(
  page: Page,
  email: string,
  previous?: string | null,
) {
  await page.goto(await waitForMagicLink(email, previous));
}

/** Entra con el enlace mágico de punta a punta y deja la sesión abierta en `page`. */
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  const previous = await requestMagicLink(page, email);
  await openMagicLink(page, email, previous);
  await expect(page).toHaveURL("/");
}

/**
 * Entrada rápida para los tests que no prueban el login en sí: genera el enlace con la API de
 * admin (sin correo ni límite de frecuencia) y lo abre por /auth/confirm, como el enlace real.
 * Los tests de login (10.1) siguen usando el flujo completo con Mailpit.
 */
export async function signInFast(page: Page, email: string, next = "/") {
  const tokenHash = await magicLinkTokenHash(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent(next)}`,
  );
  await expect(page).toHaveURL(next);
}

export async function magicLinkTokenHash(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  return data.properties.hashed_token;
}
