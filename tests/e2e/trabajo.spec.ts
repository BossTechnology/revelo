import { createHash } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInFast } from "../support/auth";
import { createTeam, seedTask } from "../support/team";

/** PLAN.md §10.4: el trabajo diario de punta a punta. */

const panel = (page: Page) =>
  page.getByRole("complementary", { name: /Detalle de la tarea/ });
const history = (page: Page) =>
  page.getByRole("list", { name: "Historial de la tarea" });

test("crear tarea: aparece en Por hacer con el ID siguiente", async ({
  page,
}) => {
  const team = await createTeam();
  await signInFast(page, team.a.email, `/p/${team.key}`);

  for (const [n, title] of [
    [1, "Primera tarea"],
    [2, "Segunda tarea"],
  ] as const) {
    await page.getByRole("button", { name: "Nueva tarea" }).click();
    await page.getByLabel("Título").fill(title);
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page).toHaveURL(`/p/${team.key}/t/${team.key}-${n}`);
    await expect(panel(page)).toContainText(`${team.key}-${n}`);
    await panel(page).getByRole("link", { name: "Cerrar detalle" }).click();
    await expect(panel(page)).toHaveCount(0);
  }

  const todo = page.locator('[data-column="por_hacer"]');
  await expect(
    todo.getByRole("article", { name: new RegExp(`${team.key}-1:`) }),
  ).toBeVisible();
  await expect(
    todo.getByRole("article", { name: new RegExp(`${team.key}-2:`) }),
  ).toBeVisible();
});

test("pasar el turno: sale de 'Lo que me toca a mí' y entra en Mi turno de la otra persona", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Revisar el handoff",
    turnUserId: team.a.id,
  });

  await signInFast(page, team.a.email, `/p/${team.key}?filtro=mio`);
  await expect(
    page.getByRole("article", { name: new RegExp(`${task.key}:`) }),
  ).toBeVisible();

  await page.goto(`/p/${team.key}/t/${task.key}`);
  await panel(page).getByLabel("Turno").selectOption({ label: team.b.name });
  await expect(panel(page)).toContainText(`Turno: ${team.b.name}`);
  await expect(history(page)).toContainText(
    `pasó el turno de ${team.a.name} a ${team.b.name}`,
  );

  await page.goto(`/p/${team.key}?filtro=mio`);
  await expect(page.getByRole("article")).toHaveCount(0);

  await page.goto(`/mi-turno?persona=${team.b.id}`);
  await expect(
    page.getByRole("list", { name: "Tareas con turno" }),
  ).toContainText(task.key);
});

test("responder y marcar como oficial: la marca queda en el hilo y en el historial", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Pregunta abierta",
    turnUserId: team.a.id,
    type: "pregunta",
  });
  await signInFast(page, team.a.email, `/p/${team.key}/t/${task.key}`);

  await panel(page)
    .getByPlaceholder("Responder (markdown)…")
    .fill("La respuesta es **sí**.");
  await panel(page).getByRole("button", { name: "Responder" }).click();
  const reply = panel(page).getByRole("listitem", {
    name: `Respuesta de ${team.a.name}`,
  });
  await expect(reply).toContainText("La respuesta es sí.");

  await reply.getByLabel("Marca de la respuesta").selectOption("oficial");
  await expect(reply).toContainText("Respuesta oficial");
  await expect(history(page)).toContainText(
    "marcó una respuesta como respuesta oficial",
  );
});

test("subir un archivo: el md5 que muestra la UI es el que calcula el test", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Con adjunto",
    turnUserId: team.a.id,
  });
  await signInFast(page, team.a.email, `/p/${team.key}/t/${task.key}`);

  const content = Buffer.from(`report-back ${Date.now()}\n77 tests en verde\n`);
  const md5 = createHash("md5").update(content).digest("hex");
  const sha1 = createHash("sha1").update(content).digest("hex");

  await panel(page).locator('input[type="file"]').setInputFiles({
    name: "report-back.txt",
    mimeType: "text/plain",
    buffer: content,
  });

  const item = panel(page)
    .getByRole("listitem")
    .filter({ hasText: "report-back.txt" });
  await expect(item.locator('[data-hash="md5"]')).toHaveText(md5, {
    timeout: 15_000,
  });
  await expect(item.locator('[data-hash="sha1"]')).toHaveText(sha1);
  await expect(history(page)).toContainText("adjuntó report-back.txt");
});

test("arrastrar a En proceso: cambia el estado y queda en el historial", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Para arrastrar",
    turnUserId: team.a.id,
  });
  await signInFast(page, team.a.email, `/p/${team.key}`);

  const card = page.getByRole("article", { name: new RegExp(`${task.key}:`) });
  const handle = card.getByRole("button", { name: `Mover ${task.key}` });
  const target = page.locator('[data-column="en_proceso"]');
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 15 });
  await page.mouse.up();

  await expect(
    target.getByRole("article", { name: new RegExp(`${task.key}:`) }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('[data-column="en_proceso"]')
      .getByRole("article", { name: new RegExp(`${task.key}:`) }),
  ).toBeVisible();

  await page.goto(`/p/${team.key}/t/${task.key}`);
  await expect(history(page)).toContainText("movió de Por hacer a En proceso");
});

test("dos navegadores: la respuesta de uno aparece en el otro sin recargar", async ({
  browser,
  baseURL,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "En vivo",
    turnUserId: team.a.id,
  });
  const path = `/p/${team.key}/t/${task.key}`;

  const henry = await (await browser.newContext({ baseURL })).newPage();
  const federico = await (await browser.newContext({ baseURL })).newPage();
  await signInFast(henry, team.a.email, path);
  await signInFast(federico, team.b.email, path);
  // Margen para que el canal de Realtime quede suscrito.
  await federico.waitForTimeout(1_500);

  const text = `Hola desde el otro navegador ${Date.now()}`;
  await panel(henry).getByPlaceholder("Responder (markdown)…").fill(text);
  await panel(henry).getByRole("button", { name: "Responder" }).click();

  await expect(panel(federico)).toContainText(text, { timeout: 15_000 });
  await henry.context().close();
  await federico.context().close();
});

test.describe("modo oscuro", () => {
  test.use({ colorScheme: "dark" });

  test("sin errores de contraste (axe) en login, board y detalle", async ({
    page,
    browser,
    baseURL,
  }) => {
    const check = async (p: Page, where: string) => {
      await expect(p.locator("html")).toHaveClass(/dark/);
      const { violations } = await new AxeBuilder({ page: p })
        .withRules(["color-contrast"])
        .analyze();
      expect(
        violations.flatMap((v) =>
          v.nodes.map(
            (n) => `${where}: ${n.target.join(" ")} — ${n.failureSummary}`,
          ),
        ),
      ).toEqual([]);
    };

    const anon = await (
      await browser.newContext({ baseURL, colorScheme: "dark" })
    ).newPage();
    await anon.goto("/login");
    await check(anon, "login");
    await anon.context().close();

    const team = await createTeam();
    const task = await seedTask(team, {
      title: "Contraste",
      turnUserId: team.a.id,
    });
    await signInFast(page, team.a.email, `/p/${team.key}`);
    await check(page, "board");
    await page.goto(`/p/${team.key}/t/${task.key}`);
    await expect(panel(page)).toBeVisible();
    await check(page, "detalle");
  });
});
