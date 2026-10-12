import { expect, test } from "@playwright/test";

import { signInFast } from "../support/auth";
import { adminClient } from "../support/supabase";
import { createTeam, seedTask } from "../support/team";

/**
 * Fase 7 (docs/adr/0001): los proyectos se agrupan por empresa y una categoría filtra el
 * tablero. Cambiar la categoría de una tarea queda en su historial.
 */
test("empresa en la barra lateral, filtro por categoría y cambio de categoría", async ({
  page,
}) => {
  const team = await createTeam();
  const { data: cats, error } = await adminClient()
    .from("categories")
    .insert([
      { project_id: team.projectId, name: "Cafetería", position: 0 },
      { project_id: team.projectId, name: "Contenido", position: 1 },
    ])
    .select("id, name");
  if (error) throw error;
  const cafe = cats.find((c) => c.name === "Cafetería")!;

  const inCafe = await seedTask(team, {
    title: "Menú de temporada",
    turnUserId: team.a.id,
    categoryId: cafe.id,
  });
  const loose = await seedTask(team, {
    title: "Términos y privacidad",
    turnUserId: team.a.id,
  });

  await signInFast(page, team.a.email, `/p/${team.key}`);

  // La empresa encabeza su grupo de proyectos en la barra lateral.
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByText(team.company)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Ruta" })).toContainText(
    team.company,
  );

  // La tarjeta muestra su categoría y el filtro deja solo esa categoría.
  await expect(
    page.getByRole("article", { name: new RegExp(inCafe.key) }),
  ).toContainText("Cafetería");
  const categoryFilter = page.getByRole("group", {
    name: "Filtrar por categoría",
  });
  await categoryFilter.getByRole("link", { name: /Cafetería/ }).click();
  await expect(page).toHaveURL(new RegExp(`categoria=${cafe.id}`));
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toHaveAccessibleName(
    new RegExp(inCafe.key),
  );
  await categoryFilter.getByRole("link", { name: /Sin categoría/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toHaveAccessibleName(
    new RegExp(loose.key),
  );

  // Desde el detalle se cambia la categoría, y el historial lo registra.
  await page.goto(`/p/${team.key}/t/${loose.key}`);
  const panel = page.getByRole("complementary", {
    name: /Detalle de la tarea/,
  });
  await panel
    .getByLabel("Categoría", { exact: true })
    .selectOption({ label: "Contenido" });
  await expect(page.getByText("movió a la categoría Contenido")).toBeVisible();
});
