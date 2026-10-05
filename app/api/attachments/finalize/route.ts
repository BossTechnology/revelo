import { NextResponse, type NextRequest } from "next/server";

import { finalizeAttachment } from "@/lib/attachments/finalize";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/attachments/finalize — después de que el navegador sube el archivo a Storage,
 * registra el adjunto y calcula md5 y sha1 en el servidor (ver lib/attachments/finalize.ts).
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
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) {
    return NextResponse.json(
      { error: "Hace falta una sesión." },
      { status: 401 },
    );
  }
  const result = await finalizeAttachment(supabase, {
    userId: claims.claims.sub,
    taskId: body.taskId,
    path: body.path,
    filename: body.filename,
  });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  return NextResponse.json({
    id: result.id,
    md5: result.md5,
    sha1: result.sha1,
    size: result.size,
  });
}
