import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import { supabaseUrl } from "@/lib/supabase/env";

import type { WebhookStore } from "./webhook";

/**
 * Almacenamiento del webhook con la secret key: es uno de los usos permitidos (PLAN.md §12).
 * La actividad de Git no la escribe ninguna persona; entra solo por aquí.
 */
export function supabaseWebhookStore(): WebhookStore {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Falta SUPABASE_SECRET_KEY.");
  const db = createClient<Database>(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async findRepo(owner, repo) {
      const { data } = await db
        .from("project_repos")
        .select("project_id, projects!inner(key)")
        .ilike("owner", owner)
        .ilike("repo", repo)
        .maybeSingle();
      return data
        ? { projectId: data.project_id!, projectKey: data.projects.key }
        : null;
    },
    async insertEvent(row) {
      const { data, error } = await db
        .from("git_events")
        .upsert(
          { ...row, payload: row.payload as { [key: string]: Json } },
          { onConflict: "delivery_id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      return data?.[0]?.id ?? null;
    },
    async findTasks(projectId, keys) {
      if (keys.length === 0) return [];
      const { data } = await db
        .from("tasks")
        .select("id, key")
        .eq("project_id", projectId)
        .in("key", keys);
      return data ?? [];
    },
    async insertLinks(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("task_git_links").upsert(rows, {
        onConflict: "task_id,git_event_id",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },
  };
}
