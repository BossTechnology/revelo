"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import type { TaskStatus, TaskType } from "./domain";

/**
 * Escrituras del trabajo diario. Todas usan la sesión del usuario: RLS y los triggers
 * (vía, autor, firma, historial) aplican igual que si se llamara a la API directamente.
 */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const TYPES: TaskType[] = ["handoff", "pregunta", "decision", "externo"];
const STATUSES: TaskStatus[] = ["por_hacer", "en_proceso", "terminado"];

/** "u:<uuid>" = una persona, "t:<nombre>" = un tercero. */
function parseTurn(target: string) {
  if (target.startsWith("u:") && target.length > 2) {
    return {
      turn: "persona" as const,
      turn_user_id: target.slice(2),
      turn_third_party: null,
    };
  }
  if (target.startsWith("t:") && target.slice(2).trim()) {
    return {
      turn: "tercero" as const,
      turn_user_id: null,
      turn_third_party: target.slice(2).trim(),
    };
  }
  return null;
}

function friendly(error: { message: string; code?: string }) {
  if (error.code === "42501")
    return error.message.includes("row-level")
      ? "No tienes acceso a este proyecto."
      : error.message;
  if (error.code === "23505") return "Ya existe un proyecto con ese prefijo.";
  if (error.code === "23514")
    return "Esa combinación de estado y turno no es válida.";
  return error.message;
}

function refresh(projectKey: string) {
  revalidatePath(`/p/${projectKey}`, "layout");
  revalidatePath("/");
  revalidatePath("/mi-turno");
}

export async function createProject(input: {
  name: string;
  key: string;
  color: string;
  memberIds: string[];
}): Promise<ActionResult<{ key: string }>> {
  const key = input.key.trim().toUpperCase();
  if (!input.name.trim())
    return { ok: false, error: "Ponle un nombre al proyecto." };
  if (!/^[A-Z]{2,5}$/.test(key))
    return {
      ok: false,
      error: "El prefijo debe tener de 2 a 5 letras (ej. MOM).",
    };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_project", {
    project_name: input.name,
    project_key: key,
    project_color: input.color,
    member_ids: input.memberIds,
  });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/", "layout");
  return { ok: true, data: { key: data.key } };
}

export async function createTask(input: {
  projectId: string;
  projectKey: string;
  type: string;
  title: string;
  body: string;
  turn: string;
  dueDate: string | null;
}): Promise<ActionResult<{ key: string }>> {
  if (!input.title.trim())
    return { ok: false, error: "La tarea necesita un título." };
  if (!TYPES.includes(input.type as TaskType))
    return { ok: false, error: "Tipo de tarea no válido." };
  const turn = parseTurn(input.turn);
  if (!turn) return { ok: false, error: "Elige de quién es el turno." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      // number, key, created_by y created_via los fija el servidor (triggers).
      number: 0,
      key: "",
      created_by: claims?.claims.sub ?? "",
      created_via: "web",
      type: input.type as TaskType,
      title: input.title.trim(),
      body: input.body,
      due_date: input.dueDate || null,
      ...turn,
    })
    .select("key")
    .single();
  if (error) return { ok: false, error: friendly(error) };
  refresh(input.projectKey);
  return { ok: true, data: { key: data.key } };
}

export async function updateTask(input: {
  taskId: string;
  projectKey: string;
  title?: string;
  body?: string;
  dueDate?: string | null;
}): Promise<ActionResult> {
  const patch: { title?: string; body?: string; due_date?: string | null } = {};
  if (input.title !== undefined) {
    if (!input.title.trim())
      return { ok: false, error: "El título no puede quedar vacío." };
    patch.title = input.title.trim();
  }
  if (input.body !== undefined) patch.body = input.body;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", input.taskId);
  if (error) return { ok: false, error: friendly(error) };
  refresh(input.projectKey);
  return { ok: true };
}

/**
 * Mover entre columnas. Terminado exige que nadie tenga el turno; al reabrir una tarea
 * cerrada, el turno vuelve a quien la reabre.
 */
export async function moveTask(input: {
  taskId: string;
  projectKey: string;
  status: string;
}): Promise<ActionResult> {
  if (!STATUSES.includes(input.status as TaskStatus))
    return { ok: false, error: "Estado no válido." };
  const status = input.status as TaskStatus;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: current } = await supabase
    .from("tasks")
    .select("status, turn")
    .eq("id", input.taskId)
    .single();
  if (!current) return { ok: false, error: "No se encontró la tarea." };
  if (current.status === status) return { ok: true };

  const patch =
    status === "terminado"
      ? {
          status,
          turn: "nadie" as const,
          turn_user_id: null,
          turn_third_party: null,
        }
      : current.turn === "nadie"
        ? {
            status,
            turn: "persona" as const,
            turn_user_id: claims?.claims.sub ?? null,
            turn_third_party: null,
          }
        : { status };

  const { error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", input.taskId);
  if (error) return { ok: false, error: friendly(error) };
  refresh(input.projectKey);
  return { ok: true };
}

export async function passTurn(input: {
  taskId: string;
  projectKey: string;
  target: string;
}): Promise<ActionResult> {
  const turn = parseTurn(input.target);
  if (!turn) return { ok: false, error: "Elige a quién pasarle el turno." };
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tasks")
    .select("status")
    .eq("id", input.taskId)
    .single();
  if (current?.status === "terminado") {
    return {
      ok: false,
      error: "La tarea está terminada. Muévela a otra columna para reabrirla.",
    };
  }
  const { error } = await supabase
    .from("tasks")
    .update(turn)
    .eq("id", input.taskId);
  if (error) return { ok: false, error: friendly(error) };
  refresh(input.projectKey);
  return { ok: true };
}

export async function addReply(input: {
  taskId: string;
  projectKey: string;
  body: string;
}): Promise<ActionResult> {
  if (!input.body.trim()) return { ok: false, error: "Escribe la respuesta." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase.from("replies").insert({
    task_id: input.taskId,
    body: input.body.trim(),
    // author_id y via los fija el servidor (trigger).
    author_id: claims?.claims.sub ?? "",
    via: "web",
  });
  if (error) return { ok: false, error: friendly(error) };
  refresh(input.projectKey);
  return { ok: true };
}

export async function markReply(input: {
  replyId: string;
  projectKey: string;
  mark: "normal" | "oficial" | "firmada";
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("replies")
    .update({ mark: input.mark })
    .eq("id", input.replyId);
  if (error) return { ok: false, error: friendly(error) };
  refresh(input.projectKey);
  return { ok: true };
}

/** URL firmada de subida a Storage: el navegador sube directo, sin pasar el archivo por Next. */
export async function createUploadUrl(input: {
  taskId: string;
  filename: string;
  size: number;
}): Promise<ActionResult<{ path: string; token: string }>> {
  if (input.size > 52_428_800)
    return { ok: false, error: "El archivo pasa de 50 MB." };
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", input.taskId)
    .single();
  if (!task) return { ok: false, error: "No se encontró la tarea." };
  const safeName = sanitizeFilename(input.filename);
  const path = `${task.project_id}/${task.id}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUploadUrl(path);
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, data: { path, token: data.token } };
}

/** URL firmada de descarga, válida 5 minutos (PLAN.md §5). */
export async function attachmentDownloadUrl(
  attachmentId: string,
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data: att } = await supabase
    .from("attachments")
    .select("storage_path, filename")
    .eq("id", attachmentId)
    .single();
  if (!att) return { ok: false, error: "No se encontró el adjunto." };
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(att.storage_path, 300, { download: att.filename });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, data: { url: data.signedUrl } };
}

function sanitizeFilename(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "archivo";
}
