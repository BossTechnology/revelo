import { expect, type Page } from "@playwright/test";

import { latestLinkTo, latestMessageId } from "./mailpit";

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
