import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { relativeAge, type TaskStatus } from "./domain";

/**
 * Lecturas de la app. Todas usan el cliente con la sesión del usuario: RLS decide qué se ve,
 * igual que si se consultara la API de Supabase directamente.
 */

export type ProfileLite = {
  id: string;
  display_name: string;
  turn_color: string;
  role: string;
};

export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, turn_color, role")
    .order("display_name");
  const all = (profiles ?? []) as ProfileLite[];
  const me = all.find((p) => p.id === userId) ?? null;
  // Crear proyectos exige ser editor de alguno (Fase 8).
  const { count: editorOf } = await supabase
    .from("project_members")
    .select("project_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("acceso", "editor");
  return {
    userId,
    email: data.claims.email as string | undefined,
    me,
    profiles: new Map(all.map((p) => [p.id, p])),
    canCreateProjects: (editorOf ?? 0) > 0,
  };
});

export const getSidebar = cache(async () => {
  const supabase = await createClient();
  const viewer = await getViewer();
  const [{ data: projects }, { data: open }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, key, color, companies(id, name)")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("tasks")
      .select("project_id, turn, turn_user_id")
      .neq("status", "terminado"),
  ]);
  const openByProject = new Map<string, number>();
  let myTurn = 0;
  for (const t of open ?? []) {
    openByProject.set(t.project_id, (openByProject.get(t.project_id) ?? 0) + 1);
    if (t.turn === "persona" && t.turn_user_id === viewer?.userId) myTurn++;
  }
  const list = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    key: p.key,
    color: p.color,
    open: openByProject.get(p.id) ?? 0,
  }));
  return {
    projects: list,
    companies: groupByCompany(projects ?? [], list),
    myTurn,
  };
});

/**
 * Agrupa por empresa (Fase 7), en orden alfabético de empresa y conservando el orden de los
 * proyectos dentro de cada una.
 */
function groupByCompany<T extends { id: string }>(
  rows: { id: string; companies: { id: string; name: string } }[],
  items: T[],
): { id: string; name: string; projects: T[] }[] {
  const companyOf = new Map(rows.map((r) => [r.id, r.companies]));
  const groups = new Map<string, { id: string; name: string; projects: T[] }>();
  for (const item of items) {
    const company = companyOf.get(item.id);
    if (!company) continue;
    const group = groups.get(company.id) ?? { ...company, projects: [] };
    group.projects.push(item);
    groups.set(company.id, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

/** Empresas que ve la persona: las sugiere el diálogo de nuevo proyecto. */
export async function getCompanies() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name")
    .order("name");
  return data ?? [];
}

type ActivityRow = { at: string; text: string };

/** Última actividad por proyecto: el evento más reciente del historial o de Git. */
async function lastActivity(
  projectIds: string[],
): Promise<Map<string, ActivityRow>> {
  const result = new Map<string, ActivityRow>();
  if (projectIds.length === 0) return result;
  const supabase = await createClient();
  const [{ data: events }, { data: git }] = await Promise.all([
    supabase
      .from("task_events")
      .select("created_at, kind, to_value, tasks!inner(key, project_id)")
      .in("tasks.project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("git_events")
      .select("project_id, occurred_at, kind, pr_number, state, title")
      .in("project_id", projectIds)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  const describeEvent = (e: NonNullable<typeof events>[number]) => {
    const key = e.tasks.key;
    switch (e.kind) {
      case "creada":
        return `${key} creada`;
      case "estado":
        return `${key} pasó a ${statusLabel(e.to_value)}`;
      case "turno":
        return `${key}: turno de ${e.to_value}`;
      case "respuesta":
        return `Respuesta en ${key}`;
      case "adjunto":
        return `Adjunto en ${key}`;
      case "marca":
        return `${key}: respuesta ${e.to_value}`;
      default:
        return key;
    }
  };
  const describeGit = (g: NonNullable<typeof git>[number]) => {
    if (g.kind === "pull_request")
      return `PR #${g.pr_number} ${g.state === "merged" ? "mergeado" : "abierto"}`;
    if (g.kind === "check")
      return `CI ${g.state === "success" ? "verde" : "rojo"} en PR #${g.pr_number}`;
    return g.title ?? "Actividad en Git";
  };

  for (const e of events ?? []) {
    const id = e.tasks.project_id;
    if (!result.has(id))
      result.set(id, { at: e.created_at, text: describeEvent(e) });
  }
  for (const g of git ?? []) {
    if (!g.project_id) continue;
    const current = result.get(g.project_id);
    if (!current || current.at < g.occurred_at) {
      result.set(g.project_id, { at: g.occurred_at, text: describeGit(g) });
    }
  }
  for (const [id, row] of result)
    result.set(id, {
      at: row.at,
      text: `${row.text} · ${relativeAge(row.at)}`,
    });
  return result;
}

function statusLabel(status: string | null) {
  return status === "por_hacer"
    ? "Por hacer"
    : status === "en_proceso"
      ? "En proceso"
      : "Terminado";
}

export async function getProjectsOverview() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select(
      "id, name, key, color, companies(id, name), project_repos(owner, repo), tasks(status, turn, turn_user_id)",
    )
    .is("archived_at", null)
    .order("name");
  const list = projects ?? [];
  const activity = await lastActivity(list.map((p) => p.id));

  const overview = list.map((p) => {
    const byStatus: Record<TaskStatus, number> = {
      por_hacer: 0,
      en_proceso: 0,
      terminado: 0,
    };
    const waitingFor = new Map<string, number>();
    let thirdParty = 0;
    for (const t of p.tasks) {
      byStatus[t.status]++;
      if (t.status === "terminado") continue;
      if (t.turn === "persona" && t.turn_user_id) {
        waitingFor.set(
          t.turn_user_id,
          (waitingFor.get(t.turn_user_id) ?? 0) + 1,
        );
      }
      if (t.turn === "tercero") thirdParty++;
    }
    return {
      id: p.id,
      name: p.name,
      key: p.key,
      color: p.color,
      repos: p.project_repos.map((r) => `${r.owner}/${r.repo}`),
      byStatus,
      total: p.tasks.length,
      waitingFor,
      thirdParty,
      lastActivity: activity.get(p.id)?.text ?? null,
    };
  });
  return { projects: overview, companies: groupByCompany(list, overview) };
}

export async function getBoard(projectKey: string) {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, key, color, companies(name), project_repos(owner, repo), project_members(user_id, acceso), categories(id, name, position, archived_at)",
    )
    .eq("key", projectKey)
    .maybeSingle();
  if (!project) return null;

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      `id, key, aliases, type, title, status, turn, turn_user_id, turn_third_party, due_date, created_at, updated_at,
       category_id, replies(count), attachments(count),
       task_git_links(git_events(kind, ref, pr_number, state, payload, occurred_at))`,
    )
    .eq("project_id", project.id)
    .order("number", { ascending: false });

  const activity = await lastActivity([project.id]);

  return {
    project: {
      id: project.id,
      name: project.name,
      key: project.key,
      color: project.color,
      company: project.companies.name,
      repos: project.project_repos.map((r) => `${r.owner}/${r.repo}`),
      // Solo un editor escribe y puede tener el turno (Fase 8).
      editorIds: project.project_members
        .filter((m) => m.acceso === "editor")
        .map((m) => m.user_id),
      categories: sortCategories(project.categories),
      lastActivity: activity.get(project.id)?.text ?? null,
    },
    tasks: (tasks ?? []).map((t) => {
      const git = t.task_git_links
        .map((l) => l.git_events)
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
      const pr = git.find((g) => g.kind === "pull_request");
      const check = git.find((g) => g.kind === "check");
      const checkPayload = (check?.payload ?? {}) as {
        passed?: number;
        total?: number;
      };
      return {
        id: t.id,
        key: t.key,
        aliases: t.aliases,
        type: t.type,
        title: t.title,
        status: t.status,
        turn: t.turn,
        turn_user_id: t.turn_user_id,
        turn_third_party: t.turn_third_party,
        dueDate: t.due_date,
        createdAt: t.created_at,
        categoryId: t.category_id,
        replies: t.replies[0]?.count ?? 0,
        attachments: t.attachments[0]?.count ?? 0,
        git: pr
          ? {
              branch: pr.ref,
              pr: `PR #${pr.pr_number}`,
              merged: pr.state === "merged",
              ci: check
                ? {
                    ok: check.state === "success",
                    text:
                      checkPayload.total != null
                        ? `CI ${checkPayload.passed}/${checkPayload.total}`
                        : `CI ${check.state === "success" ? "verde" : "rojo"}`,
                  }
                : null,
            }
          : null,
      };
    }),
  };
}

export type Category = {
  id: string;
  name: string;
  position: number;
  archived_at: string | null;
};

/** Activas primero (por posición), las archivadas al final. */
function sortCategories(list: Category[]) {
  return [...list].sort(
    (a, b) =>
      Number(a.archived_at !== null) - Number(b.archived_at !== null) ||
      a.position - b.position ||
      a.name.localeCompare(b.name, "es"),
  );
}

export type Board = NonNullable<Awaited<ReturnType<typeof getBoard>>>;
export type BoardTask = Board["tasks"][number];

export async function getTaskDetail(projectKey: string, taskKey: string) {
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select(
      `id, key, aliases, type, title, body, status, turn, turn_user_id, turn_third_party, due_date,
       created_at, created_by, created_via, project_id, category_id,
       projects!inner(key, categories(id, name, position, archived_at))`,
    )
    .eq("key", taskKey)
    .eq("projects.key", projectKey)
    .maybeSingle();
  if (!task) return null;

  const [
    { data: replies },
    { data: attachments },
    { data: events },
    { data: links },
  ] = await Promise.all([
    supabase
      .from("replies")
      .select("id, author_id, body, mark, via, created_at")
      .eq("task_id", task.id)
      .order("created_at"),
    supabase
      .from("attachments")
      .select(
        "id, filename, size_bytes, md5, sha1, uploaded_by, via, created_at",
      )
      .eq("task_id", task.id)
      .order("created_at"),
    supabase
      .from("task_events")
      .select("id, actor_id, via, kind, from_value, to_value, created_at")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("task_git_links")
      .select(
        "matched_in, git_events(id, kind, ref, sha, pr_number, title, state, url, occurred_at)",
      )
      .eq("task_id", task.id),
  ]);

  return {
    task,
    categories: sortCategories(task.projects.categories),
    replies: replies ?? [],
    attachments: attachments ?? [],
    events: events ?? [],
    git: (links ?? [])
      .map((l) => l.git_events)
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
  };
}

export type TaskDetail = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>;

/** Tareas abiertas donde el turno es de `userId`, de todos los proyectos (Mi turno). */
export async function getTurnList(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      `id, key, type, title, status, due_date, created_at,
       projects!inner(key, name, color),
       task_git_links(git_events(kind, pr_number, state, payload, occurred_at))`,
    )
    .eq("turn", "persona")
    .eq("turn_user_id", userId)
    .neq("status", "terminado")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getThirdPartyList() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "id, key, title, turn_third_party, due_date, created_at, projects!inner(key, name, color)",
    )
    .eq("turn", "tercero")
    .neq("status", "terminado")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return data ?? [];
}
