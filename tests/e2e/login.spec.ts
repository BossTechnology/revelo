import { expect, test } from "@playwright/test";

import { openMagicLink, requestMagicLink } from "../support/auth";
import { messagesTo } from "../support/mailpit";
import { createInvitedUser, testEmail, userExists } from "../support/supabase";

test.describe("login (PLAN.md §10.1)", () => {
  test("si Supabase rechaza la cuenta de Google, /login lo explica sin revelar más", async ({
    page,
  }) => {
    // Así vuelve Supabase cuando el registro está cerrado o el hook rechaza el correo.
    await page.goto(
      "/auth/callback?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed",
    );
    await expect(page).toHaveURL("/login?error=acceso");
    await expect(
      page.getByText(
        "Esa cuenta no tiene acceso. Relevo es solo con invitación.",
      ),
    ).toBeVisible();
  });

  test("un correo invitado recibe el enlace mágico, entra y llega a /", async ({
    page,
  }) => {
    const email = testEmail("invitado");
    await createInvitedUser(email, "Henry E2E");

    await page.goto("/login");
    const previous = await requestMagicLink(page, email);
    await openMagicLink(page, email, previous);

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Henry E2E")).toBeVisible();
  });

  test("un correo no invitado ve el mismo mensaje, no recibe correo y no crea cuenta", async ({
    page,
  }) => {
    const email = testEmail("intruso");

    await page.goto("/login");
    await requestMagicLink(page, email);

    // Margen para que un correo que no debería salir tuviera tiempo de llegar.
    await page.waitForTimeout(2_000);
    expect(await messagesTo(email)).toHaveLength(0);
    expect(await userExists(email)).toBe(false);
  });

  test("una ruta protegida sin sesión manda a /login y después vuelve a la ruta original", async ({
    page,
  }) => {
    const email = testEmail("vuelta");
    await createInvitedUser(email);

    await page.goto("/?desde=e2e");
    await expect(page).toHaveURL(/\/login\?next=%2F%3Fdesde%3De2e$/);

    const previous = await requestMagicLink(page, email);
    await openMagicLink(page, email, previous);
    await expect(page).toHaveURL("/?desde=e2e");
  });

  test("al cerrar sesión la cookie desaparece y una ruta protegida vuelve a redirigir", async ({
    page,
    context,
  }) => {
    const email = testEmail("salida");
    await createInvitedUser(email);

    await page.goto("/login");
    const previous = await requestMagicLink(page, email);
    await openMagicLink(page, email, previous);
    await expect(page).toHaveURL("/");

    const authCookies = async () =>
      (await context.cookies()).filter(
        (c) => c.name.startsWith("sb-") && c.name.includes("auth"),
      );
    expect(await authCookies()).not.toHaveLength(0);

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL("/login");
    expect(await authCookies()).toHaveLength(0);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });
});
