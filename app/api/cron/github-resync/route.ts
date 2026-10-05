import { createClient } from "@supabase/supabase-js";

import {
  checkSuitesFor,
  installationToken,
  recentPullRequests,
} from "@/lib/github/app";
import { supabaseWebhookStore } from "@/lib/github/store";
import { ingestEvent } from "@/lib/github/webhook";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseUrl } from "@/lib/supabase/env";

/**
 * Vercel Cron diario (vercel.json): consulta la API de GitHub de cada repo conectado y rellena
 * los eventos que un webhook perdido no trajo (PLAN.md §6). Los delivery_id sintéticos incluyen
 * la fecha de actualización, así correrlo varias veces no duplica nada.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseSecret)
    return Response.json(
      { error: "Falta SUPABASE_SECRET_KEY." },
      { status: 500 },
    );

  const db = createClient<Database>(supabaseUrl(), supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: repos } = await db
    .from("project_repos")
    .select("owner, repo, installation_id");
  const store = supabaseWebhookStore();
  const tokens = new Map<number, Promise<string>>();
  const summary: { repo: string; stored: number; error?: string }[] = [];

  for (const r of repos ?? []) {
    const name = `${r.owner}/${r.repo}`;
    try {
      if (!tokens.has(r.installation_id))
        tokens.set(r.installation_id, installationToken(r.installation_id));
      const token = await tokens.get(r.installation_id)!;
      const repository = { name: r.repo, owner: { login: r.owner } };
      let stored = 0;

      for (const pr of await recentPullRequests(r.owner, r.repo, token)) {
        const res = await ingestEvent(
          store,
          "pull_request",
          `resync:${name}#${pr.number}@${pr.updated_at}`,
          {
            repository,
            pull_request: { ...pr, merged: pr.merged_at !== null },
          },
        );
        if (res.body.stored) stored++;
        if (pr.state !== "open") continue;
        for (const cs of await checkSuitesFor(
          r.owner,
          r.repo,
          pr.head.sha,
          token,
        )) {
          const check = await ingestEvent(
            store,
            "check_suite",
            `resync:${name}:check:${cs.id}@${cs.updated_at}`,
            {
              repository,
              check_suite: cs,
            },
          );
          if (check.body.stored) stored++;
        }
      }
      summary.push({ repo: name, stored });
    } catch (e) {
      summary.push({
        repo: name,
        stored: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return Response.json({ repos: summary });
}
