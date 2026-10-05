import { createHmac, timingSafeEqual } from "node:crypto";

import { linksFor, type Source } from "./ids";

/**
 * Webhook de la GitHub App (PLAN.md §6). Separado del almacenamiento para probarlo con Vitest:
 *  1. Verifica X-Hub-Signature-256 en tiempo constante. Si no coincide: 401 y nada se guarda.
 *  2. Idempotencia por X-GitHub-Delivery: un delivery repetido no duplica eventos.
 *  3. Ubica el proyecto por owner/repo. Si el repo no está conectado, guarda el evento sin vincular.
 *  4. Vincula solo IDs con el prefijo del proyecto dueño del repo.
 */

export type GitEventRow = {
  delivery_id: string;
  project_id: string | null;
  owner: string;
  repo: string;
  kind: "push" | "commit" | "pull_request" | "check";
  ref: string | null;
  sha: string | null;
  pr_number: number | null;
  title: string | null;
  state: string | null;
  url: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export interface WebhookStore {
  findRepo(
    owner: string,
    repo: string,
  ): Promise<{ projectId: string; projectKey: string } | null>;
  /** Devuelve el id del evento, o null si el delivery ya existía. */
  insertEvent(row: GitEventRow): Promise<number | null>;
  findTasks(
    projectId: string,
    keys: string[],
  ): Promise<{ id: string; key: string }[]>;
  insertLinks(
    rows: { task_id: string; git_event_id: number; matched_in: Source }[],
  ): Promise<void>;
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | null,
): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`,
  );
  const received = Buffer.from(header);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

type Repo = { name: string; owner: { login?: string; name?: string } };
type Payload = Record<string, unknown> & { repository?: Repo };

/** Traduce el payload de GitHub a una fila de git_events y los textos donde buscar IDs. */
export function normalize(
  event: string,
  delivery: string,
  p: Payload,
): {
  row: Omit<GitEventRow, "project_id">;
  texts: { source: Source; text: string | null | undefined }[];
} | null {
  const repo = p.repository;
  if (!repo) return null;
  const owner = repo.owner.login ?? repo.owner.name ?? "";
  const base = { delivery_id: delivery, owner, repo: repo.name, payload: p };

  if (event === "push") {
    const ref = String(p.ref ?? "").replace(/^refs\/heads\//, "");
    const commits =
      (p.commits as
        | { id: string; message: string; url: string; timestamp: string }[]
        | undefined) ?? [];
    const head = p.head_commit as
      { message?: string; timestamp?: string } | null | undefined;
    return {
      row: {
        ...base,
        kind: "push",
        ref,
        sha: (p.after as string) ?? null,
        pr_number: null,
        title: head?.message?.split("\n")[0] ?? null,
        state: null,
        url: (p.compare as string) ?? null,
        occurred_at: head?.timestamp ?? new Date().toISOString(),
      },
      texts: [
        { source: "branch", text: ref },
        ...commits.map((c) => ({ source: "commit" as const, text: c.message })),
      ],
    };
  }

  if (event === "pull_request") {
    const pr = p.pull_request as {
      number: number;
      title: string;
      body: string | null;
      state: string;
      merged: boolean;
      html_url: string;
      updated_at: string;
      head: { ref: string; sha: string };
    };
    return {
      row: {
        ...base,
        kind: "pull_request",
        ref: pr.head.ref,
        sha: pr.head.sha,
        pr_number: pr.number,
        title: pr.title,
        state: pr.merged ? "merged" : pr.state,
        url: pr.html_url,
        occurred_at: pr.updated_at,
      },
      texts: [
        { source: "branch", text: pr.head.ref },
        { source: "pr_title", text: pr.title },
        { source: "pr_body", text: pr.body },
      ],
    };
  }

  if (event === "check_suite") {
    const cs = p.check_suite as {
      head_branch: string | null;
      head_sha: string;
      status: string;
      conclusion: string | null;
      updated_at: string;
      url: string;
      pull_requests: { number: number }[];
      app?: { name?: string };
    };
    return {
      row: {
        ...base,
        kind: "check",
        ref: cs.head_branch,
        sha: cs.head_sha,
        pr_number: cs.pull_requests[0]?.number ?? null,
        title: cs.app?.name ?? "CI",
        state: cs.conclusion ?? cs.status,
        url: null,
        occurred_at: cs.updated_at,
      },
      texts: [{ source: "branch", text: cs.head_branch }],
    };
  }

  return null;
}

export async function handleWebhook(input: {
  secret: string;
  store: WebhookStore;
  rawBody: string;
  headers: {
    signature: string | null;
    event: string | null;
    delivery: string | null;
  };
}): Promise<WebhookResult> {
  const { secret, store, rawBody, headers } = input;
  if (!verifySignature(secret, rawBody, headers.signature)) {
    return { status: 401, body: { error: "Firma inválida." } };
  }
  if (headers.event === "ping")
    return { status: 200, body: { ok: true, pong: true } };
  if (!headers.delivery || !headers.event)
    return { status: 400, body: { error: "Faltan cabeceras de GitHub." } };

  let payload: Payload;
  try {
    payload = JSON.parse(rawBody) as Payload;
  } catch {
    return { status: 400, body: { error: "JSON inválido." } };
  }
  return ingestEvent(store, headers.event, headers.delivery, payload);
}

/**
 * Guarda y vincula un evento ya autenticado. Lo usan el webhook (después de verificar la firma)
 * y el cron de resync (que lee la API de GitHub con el token de la instalación).
 */
export async function ingestEvent(
  store: WebhookStore,
  event: string,
  delivery: string,
  payload: Payload,
): Promise<WebhookResult> {
  const normalized = normalize(event, delivery, payload);
  if (!normalized) return { status: 202, body: { ignored: event } };

  const repo = await store.findRepo(normalized.row.owner, normalized.row.repo);
  const eventId = await store.insertEvent({
    ...normalized.row,
    project_id: repo?.projectId ?? null,
  });
  if (eventId === null) return { status: 200, body: { duplicate: true } };
  if (!repo) return { status: 200, body: { stored: eventId, linked: [] } };

  const links = linksFor(repo.projectKey, normalized.texts);
  if (links.size === 0)
    return { status: 200, body: { stored: eventId, linked: [] } };
  const tasks = await store.findTasks(repo.projectId, [...links.keys()]);
  await store.insertLinks(
    tasks.map((t) => ({
      task_id: t.id,
      git_event_id: eventId,
      matched_in: links.get(t.key)!,
    })),
  );
  return {
    status: 200,
    body: { stored: eventId, linked: tasks.map((t) => t.key) },
  };
}
