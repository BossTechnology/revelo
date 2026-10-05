import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { magicLinkTokenHash, signInFast } from "../support/auth";
import { createInvitedUser, testEmail } from "../support/supabase";

/** Personas del seed local (supabase/seed.sql). */
const HENRY = "henry@relevo.test";

test.describe("proyectos y board (Fase 2)", () => {
  // Supabase guarda un solo token de enlace por usuario: los tests que entran como Henry van en
  // serie para que uno no invalide el enlace del otro.
  test.describe.configure({ mode: "serial" });

  test("Henry ve sus 3 proyectos con conteos por estado y por turno", async ({
    page,
  }) => {
    await signInFast(page, HENRY);

    const cards = page.getByRole("main").getByRole("listitem");
    await expect(cards).toHaveCount(3);
    const bob = cards.filter({ hasText: "BOb" });
    await expect(bob).toContainText("BossTechnology/Bob-New");
    await expect(bob).toContainText("Por hacer 3");
    await expect(bob).toContainText("En proceso 2");
    await expect(bob).toContainText("Terminado 4");
    await expect(page.getByText("Te toca · 3")).toBeVisible();
  });

  test("el board de BOb muestra las tres columnas y filtra por turno", async ({
    page,
  }) => {
    await signInFast(page, HENRY);
    await page.getByRole("link", { name: /BOb/ }).first().click();
    await expect(page).toHaveURL("/p/BOB");

    const column = (name: string) =>
      page
        .getByRole("region", { name: "Tablero" })
        .locator("div")
        .filter({ has: page.getByRole("heading", { name }) })
        .first();
    await expect(column("Por hacer").getByRole("article")).toHaveCount(3);
    await expect(column("En proceso").getByRole("article")).toHaveCount(2);
    await expect(column("Terminado").getByRole("article")).toHaveCount(4);

    const bob14 = page.getByRole("article", { name: /BOB-14/ });
    await expect(bob14).toContainText("Turno: Henry");
    await expect(bob14).toContainText("Te toca");
    await expect(bob14).toContainText("bob-14-slice-1c");
    await expect(bob14).toContainText("CI 5/5");
    await expect(page.getByRole("article", { name: /BOB-10/ })).toContainText(
      "N-05",
    );

    await page.getByRole("link", { name: /Lo que me toca a mí/ }).click();
    await expect(page).toHaveURL("/p/BOB?filtro=mio");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toHaveAccessibleName(/BOB-14/);

    await page.getByRole("link", { name: /Terceros/ }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("quien no es miembro no ve nada, ni en la web ni en la API de Supabase", async ({
    page,
  }) => {
    const email = testEmail("ajeno");
    await createInvitedUser(email, "Ajeno E2E");

    // Web
    await signInFast(page, email);
    await expect(
      page.getByText("Aún no estás en ningún proyecto"),
    ).toBeVisible();
    const res = await page.goto("/p/BOB");
    expect(res?.status()).toBe(404);

    // API directa con su propio token (sesión propia, sin pasar por la web).
    const api = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: otpError } = await api.auth.verifyOtp({
      type: "magiclink",
      token_hash: await magicLinkTokenHash(email),
    });
    expect(otpError).toBeNull();

    for (const table of [
      "projects",
      "project_members",
      "project_repos",
      "tasks",
      "replies",
      "attachments",
      "task_events",
      "git_events",
      "task_git_links",
    ] as const) {
      const { data, error } = await api.from(table).select("*").limit(5);
      expect(error, `${table}: ${error?.message}`).toBeNull();
      expect(data, `${table} debería venir vacía`).toEqual([]);
    }
    const { data: files } = await api.storage.from("attachments").list();
    expect(files ?? []).toEqual([]);
  });
});
