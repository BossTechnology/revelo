import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { signInFast } from "../support/auth";
import { adminClient } from "../support/supabase";
import { createTeam, seedTask } from "../support/team";

/** Fase 5: el webhook real contra la base local, y lo que se ve en el board. */

const SECRET = process.env.GITHUB_WEBHOOK_SECRET!;
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function prPayload(owner: string, repo: string, branch: string, title: string) {
  const p = JSON.parse(
    readFileSync(
      path.resolve("tests/fixtures/github/pull_request.merged.json"),
      "utf8",
    ),
  );
  p.repository.name = repo;
  p.repository.full_name = `${owner}/${repo}`;
  p.repository.owner.login = owner;
  p.pull_request.head.ref = branch;
  p.pull_request.title = title;
  p.pull_request.body = "Sin otros IDs.";
  return JSON.stringify(p);
}

test("un PR mergeado aparece solo en la tarjeta; firma inválida 401; delivery repetido no duplica", async ({
  page,
  request,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, { title: "Con PR", turnUserId: team.a.id });
  const repo = `repo-${team.key.toLowerCase()}`;
  await adminClient().from("project_repos").insert({
    project_id: team.projectId,
    owner: "e2e-org",
    repo,
    installation_id: 1,
  });

  const body = prPayload(
    "e2e-org",
    repo,
    `${task.key.toLowerCase()}-algo`,
    `${task.key} listo`,
  );
  const delivery = `e2e-${Date.now()}`;
  const post = (signature: string, id = delivery) =>
    request.post("/api/github/webhook", {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-github-delivery": id,
        "x-hub-signature-256": signature,
      },
    });

  expect((await post(sign(body, "otro"), `${delivery}-mala`)).status()).toBe(
    401,
  );
  const ok = await post(sign(body));
  expect(ok.status()).toBe(200);
  expect((await ok.json()).linked).toEqual([task.key]);
  expect(await (await post(sign(body))).json()).toEqual({ duplicate: true });

  const { count } = await adminClient()
    .from("git_events")
    .select("*", { count: "exact", head: true })
    .like("delivery_id", `${delivery}%`);
  expect(count).toBe(1);

  await signInFast(page, team.a.email, `/p/${team.key}`);
  const card = page.getByRole("article", { name: new RegExp(`${task.key}:`) });
  await expect(card).toContainText(`${task.key.toLowerCase()}-algo`);
  await expect(card).toContainText("PR #23 mergeado");
  await card
    .getByRole("button", { name: `Mover ${task.key} a Terminado` })
    .click();
  await expect(
    page
      .locator('[data-column="terminado"]')
      .getByRole("article", { name: new RegExp(`${task.key}:`) }),
  ).toBeVisible();

  await page.goto(`/p/${team.key}/t/${task.key}`);
  await expect(
    page.getByRole("list", { name: "Historial de la tarea" }),
  ).toContainText("PR #23 merged");
});

test("el cron de resync exige CRON_SECRET", async ({ request }) => {
  expect((await request.get("/api/cron/github-resync")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/github-resync", {
        headers: { authorization: "Bearer otro" },
      })
    ).status(),
  ).toBe(401);
});
