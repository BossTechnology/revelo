import "server-only";

import {
  createClient as createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { supabaseUrl } from "@/lib/supabase/env";

import { fileHashes } from "./hash";

type Result =
  | { ok: true; id: string; md5: string; sha1: string; size: number }
  | { ok: false; status: number; error: string };

/**
 * Registra un adjunto ya subido a Storage y calcula sus hashes en el servidor.
 *
 * Todo pasa con el cliente de la persona (sesión web o token MCP): si no es miembro, Storage y
 * RLS lo rechazan, y el trigger fija uploaded_by y via. Solo escribir md5/sha1 usa la secret key,
 * a través de set_attachment_hashes() (ejecutable únicamente por service_role): así ningún
 * cliente, humano o IA, puede declarar un hash.
 */
export async function finalizeAttachment(
  userClient: SupabaseClient<Database>,
  input: { taskId: string; path: string; filename: string; userId: string },
): Promise<Result> {
  const { data: task } = await userClient
    .from("tasks")
    .select("id, project_id")
    .eq("id", input.taskId)
    .single();
  if (!task)
    return { ok: false, status: 404, error: "No se encontró la tarea." };
  if (!input.path.startsWith(`${task.project_id}/${task.id}/`)) {
    return {
      ok: false,
      status: 400,
      error: "La ruta del archivo no corresponde a la tarea.",
    };
  }

  const { data: file, error: downloadError } = await userClient.storage
    .from("attachments")
    .download(input.path);
  if (downloadError || !file)
    return {
      ok: false,
      status: 404,
      error: "No se encontró el archivo subido.",
    };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { md5, sha1 } = fileHashes(bytes);

  const { data: attachment, error: insertError } = await userClient
    .from("attachments")
    .insert({
      task_id: task.id,
      storage_path: input.path,
      filename: input.filename.slice(0, 255),
      size_bytes: bytes.byteLength,
      // uploaded_by y via los fija el trigger; los hashes, solo la función de servicio.
      uploaded_by: input.userId,
      via: "web",
    })
    .select("id")
    .single();
  if (insertError)
    return { ok: false, status: 400, error: insertError.message };

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret)
    return {
      ok: false,
      status: 500,
      error: "Falta SUPABASE_SECRET_KEY en el servidor.",
    };
  const admin = createAdminClient<Database>(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: hashError } = await admin.rpc("set_attachment_hashes", {
    attachment: attachment.id,
    md5_hex: md5,
    sha1_hex: sha1,
  });
  if (hashError) return { ok: false, status: 500, error: hashError.message };

  return { ok: true, id: attachment.id, md5, sha1, size: bytes.byteLength };
}

export function sanitizeFilename(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "archivo";
}
