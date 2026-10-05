import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  handleWebhook,
  verifySignature,
  type GitEventRow,
  type WebhookStore,
} from "@/lib/github/webhook";

/** PLAN.md §10.3: webhook con payloads guardados como fixtures y un almacenamiento en memoria. */

const SECRET = "secreto-de-prueba";
const fixture = (name: string) =>
  readFileSync(
    path.join(import.meta.dirname, "../fixtures/github", name),
    "utf8",
  );
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

class MemoryStore implements WebhookStore {
  repos = new Map([
    ["BossTechnology/Bob-New", { projectId: "p-bob", projectKey: "BOB" }],
  ]);
  tasks = [
    { id: "t-14", key: "BOB-14", projectId: "p-bob" },
    { id: "t-15", key: "BOB-15", projectId: "p-bob" },
    { id: "t-mom3", key: "MOM-3", projectId: "p-mom" },
  ];
  events: (GitEventRow & { id: number })[] = [];
  links: { task_id: string; git_event_id: number; matched_in: string }[] = [];

  async findRepo(owner: string, repo: string) {
    return this.repos.get(`${owner}/${repo}`) ?? null;
  }
  async insertEvent(row: GitEventRow) {
    if (this.events.some((e) => e.delivery_id === row.delivery_id)) return null;
    const id = this.events.length + 1;
    this.events.push({ ...row, id });
    return id;
  }
  async findTasks(projectId: string, keys: string[]) {
    return this.tasks.filter(
      (t) => t.projectId === projectId && keys.includes(t.key),
    );
  }
  async insertLinks(
    rows: { task_id: string; git_event_id: number; matched_in: string }[],
  ) {
    this.links.push(...rows);
  }
}

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
});

const send = (
  body: string,
  event: string,
  delivery: string,
  signature = sign(body),
) =>
  handleWebhook({
    secret: SECRET,
    store,
    rawBody: body,
    headers: { signature, event, delivery },
  });

describe("webhook de GitHub", () => {
  it("firma válida: guarda el evento del PR y lo vincula a BOB-14", async () => {
    const body = fixture("pull_request.merged.json");
    const res = await send(body, "pull_request", "d-1");
    expect(res.status).toBe(200);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({
      kind: "pull_request",
      project_id: "p-bob",
      pr_number: 23,
      state: "merged",
      ref: "bob-14-slice-1c",
    });
    expect(store.links).toEqual([
      { task_id: "t-14", git_event_id: 1, matched_in: "branch" },
    ]);
  });

  it("firma inválida: 401 y nada guardado", async () => {
    const body = fixture("pull_request.merged.json");
    const res = await send(
      body,
      "pull_request",
      "d-1",
      sign(body, "otro-secreto"),
    );
    expect(res.status).toBe(401);
    expect(store.events).toHaveLength(0);
    expect(store.links).toHaveLength(0);
  });

  it("sin firma o con el cuerpo alterado: 401", async () => {
    const body = fixture("push.json");
    expect(
      (await send(body, "push", "d-1", null as unknown as string)).status,
    ).toBe(401);
    expect(
      (await send(body.replace("BOB-14", "BOB-15"), "push", "d-2", sign(body)))
        .status,
    ).toBe(401);
    expect(store.events).toHaveLength(0);
  });

  it("delivery repetido: un solo evento", async () => {
    const body = fixture("push.json");
    await send(body, "push", "d-7");
    const again = await send(body, "push", "d-7");
    expect(again.body).toEqual({ duplicate: true });
    expect(store.events).toHaveLength(1);
    expect(store.links).toHaveLength(2);
  });

  it("ID con prefijo de otro proyecto: no se vincula (MOM-3 en el repo de BOb)", async () => {
    const res = await send(
      fixture("pull_request.merged.json"),
      "pull_request",
      "d-1",
    );
    expect(res.body.linked).toEqual(["BOB-14"]);
    expect(store.links.some((l) => l.task_id === "t-mom3")).toBe(false);
  });

  it("repo no conectado: guarda el evento sin vínculo", async () => {
    const body = fixture("push.json").replaceAll(
      '"name": "Bob-New"',
      '"name": "otro-repo"',
    );
    const res = await send(body, "push", "d-1");
    expect(res.status).toBe(200);
    expect(store.events[0]).toMatchObject({
      project_id: null,
      repo: "otro-repo",
    });
    expect(store.links).toHaveLength(0);
  });

  it("push: vincula la rama y cada commit; check_suite: vincula por la rama", async () => {
    await send(fixture("push.json"), "push", "d-1");
    expect(store.links).toEqual([
      { task_id: "t-14", git_event_id: 1, matched_in: "branch" },
      { task_id: "t-15", git_event_id: 1, matched_in: "commit" },
    ]);
    await send(fixture("check_suite.completed.json"), "check_suite", "d-2");
    expect(store.events[1]).toMatchObject({
      kind: "check",
      state: "success",
      pr_number: 23,
    });
    expect(store.links.at(-1)).toEqual({
      task_id: "t-14",
      git_event_id: 2,
      matched_in: "branch",
    });
  });

  it("ping responde y eventos no manejados se ignoran sin guardar", async () => {
    expect((await send("{}", "ping", "d-0")).body).toEqual({
      ok: true,
      pong: true,
    });
    expect(
      (
        await send(
          JSON.stringify({ repository: { name: "x", owner: { login: "y" } } }),
          "issues",
          "d-9",
        )
      ).status,
    ).toBe(202);
    expect(store.events).toHaveLength(0);
  });

  it("verifySignature compara en tiempo constante y rechaza longitudes distintas", () => {
    expect(verifySignature(SECRET, "a", sign("a"))).toBe(true);
    expect(verifySignature(SECRET, "a", "sha256=abc")).toBe(false);
    expect(verifySignature("", "a", sign("a", ""))).toBe(false);
  });
});
