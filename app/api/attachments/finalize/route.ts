import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { fileHashes } from "@/lib/attachments/hash";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/attachments/finalize — después de que el navegador sube el archivo a Storage:
 *  1. Con la sesión del usuario (RLS): descarga el archivo y registra el adjunto. Si no es
 *     miembro del proyecto, Storage y la tabla lo rechazan aquí.
 *  2. Calcula md5 y sha1 con node:crypto sobre los bytes reales.
 *  3. Solo el paso de escribir los hashes usa la secret key (función set_attachment_hashes,
 *     ejecutable únicamente por service_role): así ningún cliente puede declarar un hash.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    taskId?: string;
    path?: string;
    filename?: string;
  } | null;
  if (!body?.taskId || !body.path || !body.filename) {
    return NextResponse.json(
      { error: "Faltan datos del adjunto." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", body.taskId)
    .single();
  if (!task)
    return NextResponse.json(
      { error: "No se encontró la tarea." },
      { status: 404 },
    );
  if (!body.path.startsWith(`${task.project_id}/${task.id}/`)) {
    return NextResponse.json(
      { error: "La ruta del archivo no corresponde a la tarea." },
      { status: 400 },
    );
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from("attachments")
    .download(body.path);
  if (downloadError || !file) {
    return NextResponse.json(
      { error: "No se encontró el archivo subido." },
      { status: 404 },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { md5, sha1 } = fileHashes(bytes);

  const { data: claims } = await supabase.auth.getClaims();
  const { data: attachment, error: insertError } = await supabase
    .from("attachments")
    .insert({
      task_id: task.id,
      storage_path: body.path,
      filename: body.filename.slice(0, 255),
      size_bytes: bytes.byteLength,
      // uploaded_by y via los fija el trigger; los hashes, solo la función de servicio.
      uploaded_by: claims?.claims.sub ?? "",
      via: "web",
    })
    .select("id")
    .single();
  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 400 });

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret)
    return NextResponse.json(
      { error: "Falta SUPABASE_SECRET_KEY en el servidor." },
      { status: 500 },
    );
  const admin = createAdminClient<Database>(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: hashError } = await admin.rpc("set_attachment_hashes", {
    attachment: attachment.id,
    md5_hex: md5,
    sha1_hex: sha1,
  });
  if (hashError)
    return NextResponse.json({ error: hashError.message }, { status: 500 });

  return NextResponse.json({
    id: attachment.id,
    md5,
    sha1,
    size: bytes.byteLength,
  });
}
