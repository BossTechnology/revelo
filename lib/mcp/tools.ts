import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  finalizeAttachment,
  sanitizeFilename,
} from "@/lib/attachments/finalize";
import { TASK_TYPES, type TaskType } from "@/lib/relevo/domain";

import {
  dbError,
  findProject,
  findTask,
  resolveTurn,
  ToolError,
  userClient,
  userContent,
  type Db,
} from "./context";

/**
 * Herramientas del MCP (PLAN.md §7). Respuestas cortas y con IDs; el detalle se pide con
 * ver_tarea. Todo texto escrito por personas u otra IA va dentro de un bloque marcado.
 */

type Ctx = {
  http?: { authInfo?: { token: string; extra?: Record<string, unknown> } };
};
type Text = { content: { type: "text"; text: string }[]; isError?: boolean };

const STATUS_LABEL = {
  por_hacer: "Por hacer",
  en_proceso: "En proceso",
  terminado: "Terminado",
} as const;
const TYPE_IDS = Object.keys(TASK_TYPES) as [TaskType, ...TaskType[]];

function text(lines: (string | false | null | undefined)[]): Text {
  return {
    content: [
      {
        type: "text",
        text: lines.filter((l) => l !== false && l != null).join("\n"),
      },
    ],
  };
}

/** Envuelve cada herramienta: token, límite de 60 llamadas/min y errores legibles. */
function tool<A>(fn: (args: A, db: Db, me: string) => Promise<Text>) {
  return async (args: A, ctx: Ctx): Promise<Text> => {
    const auth = ctx.http?.authInfo;
    const me = auth?.extra?.userId;
    if (!auth?.token || typeof me !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "Falta autenticación." }],
      };
    }
    const db = userClient(auth.token);
    const { data: allowed } = await db.rpc("mcp_hit");
    if (allowed === false) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Límite de 60 llamadas por minuto alcanzado. Espera un momento.",
          },
        ],
      };
    }
    try {
      return await fn(args, db, me);
    } catch (e) {
      const message =
        e instanceof ToolError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  };
}

async function names(db: Db) {
  const { data } = await db.from("profiles").select("id, display_name");
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}

function turnText(
  t: {
    turn: string;
    turn_user_id: string | null;
    turn_third_party: string | null;
  },
  who: Map<string, string>,
  me: string,
) {
  if (t.turn === "persona")
    return t.turn_user_id === me
      ? "tú"
      : (who.get(t.turn_user_id ?? "") ?? "?");
  if (t.turn === "tercero") return `tercero: ${t.turn_third_party}`;
  return "nadie";
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "resumen_proyecto",
    {
      title: "Resumen del proyecto",
      description:
        "Estado compilado de un proyecto: tareas abiertas por turno, decisiones firmadas, último handoff y lo que tiene fecha límite. Úsala primero para orientarte.",
      inputSchema: z.object({
        proyecto: z.string().describe("Prefijo del proyecto, ej. BOB"),
      }),
      annotations: { readOnlyHint: true },
    },
    tool<{ proyecto: string }>(async ({ proyecto }, db, me) => {
      const project = await findProject(db, proyecto);
      const who = await names(db);
      const { data: tasks } = await db
        .from("tasks")
        .select(
          "id, key, type, title, status, turn, turn_user_id, turn_third_party, due_date, updated_at",
        )
        .eq("project_id", project.id)
        .order("number", { ascending: false });
      const all = tasks ?? [];
      const open = all.filter((t) => t.status !== "terminado");
      const groups = new Map<string, typeof open>();
      for (const t of open) {
        const k = turnText(t, who, me);
        groups.set(k, [...(groups.get(k) ?? []), t]);
      }
      const { data: signed } = await db
        .from("replies")
        .select("body, created_at, tasks!inner(key, project_id)")
        .eq("mark", "firmada")
        .eq("tasks.project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(8);
      const lastHandoff = all.find((t) => t.type === "handoff");
      const withDue = open
        .filter((t) => t.due_date)
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));

      return text([
        `# ${project.name} (${project.key}) · ${open.length} abiertas, ${all.length - open.length} terminadas`,
        "",
        "## Abiertas por turno",
        ...[...groups.entries()].flatMap(([k, ts]) => [
          `- Turno de ${k} (${ts.length}): ${ts
            .slice(0, 12)
            .map(
              (t) =>
                `${t.key} [${TASK_TYPES[t.type].label}, ${STATUS_LABEL[t.status]}]`,
            )
            .join("; ")}${ts.length > 12 ? "; …" : ""}`,
        ]),
        open.length === 0 && "- Nada abierto.",
        "",
        "## Con fecha límite",
        ...withDue
          .slice(0, 10)
          .map(
            (t) =>
              `- ${t.key} vence ${t.due_date} (turno de ${turnText(t, who, me)})`,
          ),
        withDue.length === 0 && "- Ninguna.",
        "",
        "## Último handoff",
        lastHandoff
          ? `- ${lastHandoff.key} · ${STATUS_LABEL[lastHandoff.status]} · actualizado ${lastHandoff.updated_at.slice(0, 10)}`
          : "- Ninguno.",
        "",
        "## Decisiones firmadas (más recientes)",
        ...(signed ?? []).map(
          (s) =>
            `- ${s.tasks.key} (${s.created_at.slice(0, 10)}):\n${userContent(s.body.slice(0, 600))}`,
        ),
        (signed ?? []).length === 0 && "- Ninguna.",
        "",
        "Títulos y detalle con ver_tarea(<ID>).",
      ]);
    }),
  );

  server.registerTool(
    "mi_turno",
    {
      title: "Mi turno",
      description:
        "Tareas de todos los proyectos donde el turno es tuyo, ordenadas por fecha límite y antigüedad.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    tool<Record<string, never>>(async (_args, db, me) => {
      const { data } = await db
        .from("tasks")
        .select(
          "key, type, title, status, due_date, created_at, projects!inner(key)",
        )
        .eq("turn", "persona")
        .eq("turn_user_id", me)
        .neq("status", "terminado")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      const rows = data ?? [];
      if (rows.length === 0) return text(["Nada pendiente en tu turno."]);
      return text([
        `${rows.length} tareas en tu turno:`,
        ...rows.map(
          (t) =>
            `- ${t.key} [${TASK_TYPES[t.type].label}, ${STATUS_LABEL[t.status]}${t.due_date ? `, vence ${t.due_date}` : ""}]`,
        ),
        "",
        "Títulos con buscar o ver_tarea(<ID>).",
      ]);
    }),
  );

  server.registerTool(
    "ver_board",
    {
      title: "Ver board",
      description:
        "Tarjetas resumidas por columna de un proyecto (sin cuerpos). Filtro opcional: mio, terceros o el nombre de una persona.",
      inputSchema: z.object({
        proyecto: z.string().describe("Prefijo del proyecto, ej. BOB"),
        filtro: z
          .string()
          .optional()
          .describe('"mio", "terceros" o el nombre de una persona'),
      }),
      annotations: { readOnlyHint: true },
    },
    tool<{ proyecto: string; filtro?: string }>(
      async ({ proyecto, filtro }, db, me) => {
        const project = await findProject(db, proyecto);
        const who = await names(db);
        const { data } = await db
          .from("tasks")
          .select(
            "key, type, title, status, turn, turn_user_id, turn_third_party, due_date",
          )
          .eq("project_id", project.id)
          .order("number", { ascending: false });
        const f = filtro?.trim().toLowerCase();
        const rows = (data ?? []).filter((t) => {
          if (!f) return true;
          if (f === "mio") return t.turn === "persona" && t.turn_user_id === me;
          if (f === "terceros") return t.turn === "tercero";
          return (
            t.turn === "persona" &&
            who.get(t.turn_user_id ?? "")?.toLowerCase() === f
          );
        });
        return text([
          `# ${project.key}${f ? ` · filtro ${f}` : ""}`,
          ...(["por_hacer", "en_proceso", "terminado"] as const).flatMap(
            (s) => {
              const col = rows.filter((t) => t.status === s);
              return [
                "",
                `## ${STATUS_LABEL[s]} (${col.length})`,
                ...col.map(
                  (t) =>
                    `- ${t.key} [${TASK_TYPES[t.type].label}] turno: ${turnText(t, who, me)}${t.due_date ? ` · vence ${t.due_date}` : ""}\n  ${userContent(t.title)}`,
                ),
              ];
            },
          ),
        ]);
      },
    ),
  );

  server.registerTool(
    "ver_tarea",
    {
      title: "Ver tarea",
      description:
        "Instrucciones, adjuntos con hash, hilo, actividad de Git e historial reciente. Acepta la clave (BOB-14) o un alias (N-05).",
      inputSchema: z.object({
        id: z.string().describe("Clave o alias, ej. BOB-14 o N-05"),
      }),
      annotations: { readOnlyHint: true },
    },
    tool<{ id: string }>(async ({ id }, db, me) => {
      const ref = await findTask(db, id);
      const who = await names(db);
      const [
        { data: t },
        { data: replies },
        { data: atts },
        { data: events },
        { data: links },
      ] = await Promise.all([
        db
          .from("tasks")
          .select(
            "key, aliases, type, title, body, status, turn, turn_user_id, turn_third_party, due_date, created_by, created_via, created_at",
          )
          .eq("id", ref.id)
          .single(),
        db
          .from("replies")
          .select("id, author_id, body, mark, via, created_at")
          .eq("task_id", ref.id)
          .order("created_at"),
        db
          .from("attachments")
          .select("id, filename, size_bytes, md5, sha1, via")
          .eq("task_id", ref.id)
          .order("created_at"),
        db
          .from("task_events")
          .select("actor_id, via, kind, from_value, to_value, created_at")
          .eq("task_id", ref.id)
          .order("created_at", { ascending: false })
          .limit(10),
        db
          .from("task_git_links")
          .select(
            "git_events(kind, ref, pr_number, state, title, url, occurred_at)",
          )
          .eq("task_id", ref.id),
      ]);
      if (!t) throw new ToolError(`No encontré la tarea ${id}.`);
      return text([
        `# ${t.key}${t.aliases.length ? ` (alias ${t.aliases.join(", ")})` : ""} · ${TASK_TYPES[t.type].label} · ${STATUS_LABEL[t.status]}`,
        `Turno: ${turnText(t, who, me)}${t.due_date ? ` · vence ${t.due_date}` : ""}`,
        `Creada por ${who.get(t.created_by) ?? "?"} vía ${t.created_via} el ${t.created_at.slice(0, 10)}`,
        "",
        "## Título",
        userContent(t.title),
        "",
        "## Instrucciones",
        t.body.trim() ? userContent(t.body) : "(vacío)",
        "",
        `## Adjuntos (${(atts ?? []).length})`,
        ...(atts ?? []).map(
          (a) =>
            `- ${a.id} · ${a.size_bytes} bytes · md5 ${a.md5 ?? "pendiente"} · sha1 ${a.sha1 ?? "pendiente"}\n  nombre: ${userContent(a.filename)}`,
        ),
        "",
        `## Hilo (${(replies ?? []).length})`,
        ...(replies ?? []).map(
          (r) =>
            `- ${who.get(r.author_id) ?? "?"}${r.via === "mcp" ? " (vía IA)" : ""} · ${r.created_at.slice(0, 16).replace("T", " ")}${r.mark !== "normal" ? ` · ${r.mark === "firmada" ? "DECISIÓN FIRMADA" : "RESPUESTA OFICIAL"}` : ""}\n${userContent(r.body)}`,
        ),
        "",
        "## Actividad en Git",
        ...(links ?? [])
          .map((l) => l.git_events)
          .filter((g) => g !== null)
          .map((g) =>
            `- ${g.kind}${g.pr_number ? ` PR #${g.pr_number}` : ""} ${g.state ?? ""} ${g.ref ?? ""} ${g.url ?? ""}`.trim(),
          ),
        (links ?? []).length === 0 && "- Nada vinculado.",
        "",
        "## Historial reciente",
        ...(events ?? []).map(
          (e) =>
            `- ${e.created_at.slice(0, 16).replace("T", " ")} ${who.get(e.actor_id ?? "") ?? "sistema"} (${e.via}): ${e.kind}${e.from_value ? ` ${e.from_value} →` : ""}${e.to_value ? ` ${e.to_value}` : ""}`,
        ),
      ]);
    }),
  );

  server.registerTool(
    "buscar",
    {
      title: "Buscar",
      description:
        "Busca tareas por ID, alias o texto en el título y las instrucciones. Devuelve IDs y títulos.",
      inputSchema: z.object({ texto: z.string().min(2) }),
      annotations: { readOnlyHint: true },
    },
    tool<{ texto: string }>(async ({ texto }, db) => {
      const q = texto.trim();
      const like = `%${q.replace(/[%_,()]/g, " ")}%`;
      const { data } = await db
        .from("tasks")
        .select("key, aliases, status, title")
        .or(
          `key.ilike.${like},title.ilike.${like},body.ilike.${like},aliases.cs.{${q.toUpperCase().replace(/[{},"]/g, "")}}`,
        )
        .order("updated_at", { ascending: false })
        .limit(20);
      const rows = data ?? [];
      if (rows.length === 0) return text([`Nada coincide con "${q}".`]);
      return text([
        `${rows.length} resultados:`,
        ...rows.map(
          (t) =>
            `- ${t.key}${t.aliases.length ? ` (${t.aliases.join(", ")})` : ""} [${STATUS_LABEL[t.status]}]: ${userContent(t.title)}`,
        ),
      ]);
    }),
  );

  server.registerTool(
    "descargar_adjunto",
    {
      title: "Descargar adjunto",
      description:
        "URL firmada de 5 minutos para descargar un adjunto (el id sale de ver_tarea).",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    tool<{ id: string }>(async ({ id }, db) => {
      const { data: a } = await db
        .from("attachments")
        .select("storage_path, filename, md5, sha1")
        .eq("id", id)
        .maybeSingle();
      if (!a)
        throw new ToolError("No encontré el adjunto (o no tienes acceso).");
      const { data, error } = await db.storage
        .from("attachments")
        .createSignedUrl(a.storage_path, 300, { download: a.filename });
      if (error) throw dbError(error);
      return text([
        `URL (vence en 5 minutos): ${data.signedUrl}`,
        `md5 ${a.md5 ?? "pendiente"} · sha1 ${a.sha1 ?? "pendiente"}`,
      ]);
    }),
  );

  server.registerTool(
    "crear_tarea",
    {
      title: "Crear tarea",
      description:
        'Crea una tarea. turno: "yo", el nombre de una persona del proyecto o "tercero:<nombre>".',
      inputSchema: z.object({
        proyecto: z.string(),
        tipo: z.enum(TYPE_IDS),
        titulo: z.string().min(1),
        cuerpo: z.string().default(""),
        turno: z.string(),
        fecha_limite: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    },
    tool<{
      proyecto: string;
      tipo: TaskType;
      titulo: string;
      cuerpo: string;
      turno: string;
      fecha_limite?: string;
    }>(async (a, db, me) => {
      const project = await findProject(db, a.proyecto);
      const turn = await resolveTurn(db, project.id, me, a.turno);
      const { data, error } = await db
        .from("tasks")
        .insert({
          project_id: project.id,
          number: 0,
          key: "",
          type: a.tipo,
          title: a.titulo.trim(),
          body: a.cuerpo,
          due_date: a.fecha_limite ?? null,
          // created_by y created_via los fija el servidor: quedará via = mcp.
          created_by: me,
          created_via: "mcp",
          ...turn,
        })
        .select("key")
        .single();
      if (error) throw dbError(error);
      return text([`Creada ${data.key}. Turno: ${a.turno}.`]);
    }),
  );

  server.registerTool(
    "responder",
    {
      title: "Responder",
      description:
        'Agrega una respuesta al hilo. marca opcional: "oficial". "firmada" solo la puede poner una persona desde la web.',
      inputSchema: z.object({
        id: z.string(),
        texto: z.string().min(1),
        marca: z.enum(["normal", "oficial", "firmada"]).optional(),
      }),
    },
    tool<{
      id: string;
      texto: string;
      marca?: "normal" | "oficial" | "firmada";
    }>(async ({ id, texto, marca }, db, me) => {
      const t = await findTask(db, id);
      const { error } = await db.from("replies").insert({
        task_id: t.id,
        body: texto,
        mark: marca ?? "normal",
        // author_id y via los fija el servidor.
        author_id: me,
        via: "mcp",
      });
      if (error) throw dbError(error);
      return text([
        `Respuesta agregada en ${t.key}${marca && marca !== "normal" ? ` (${marca})` : ""}.`,
      ]);
    }),
  );

  server.registerTool(
    "adjuntar",
    {
      title: "Adjuntar",
      description:
        "Sube un archivo a una tarea (contenido en base64, máximo 50 MB) y devuelve sus hashes calculados en el servidor.",
      inputSchema: z.object({
        id: z.string(),
        nombre: z.string().min(1),
        contenido_base64: z.string().min(1),
      }),
    },
    tool<{ id: string; nombre: string; contenido_base64: string }>(
      async ({ id, nombre, contenido_base64 }, db, me) => {
        const t = await findTask(db, id);
        const bytes = Buffer.from(contenido_base64, "base64");
        if (bytes.byteLength > 52_428_800)
          throw new ToolError("El archivo pasa de 50 MB.");
        const path = `${t.project_id}/${t.id}/${crypto.randomUUID()}-${sanitizeFilename(nombre)}`;
        const { error: upError } = await db.storage
          .from("attachments")
          .upload(path, bytes);
        if (upError) throw dbError(upError);
        const r = await finalizeAttachment(db, {
          userId: me,
          taskId: t.id,
          path,
          filename: nombre,
        });
        if (!r.ok) throw new ToolError(r.error);
        return text([
          `Adjuntado a ${t.key}: ${r.size} bytes · md5 ${r.md5} · sha1 ${r.sha1} · id ${r.id}`,
        ]);
      },
    ),
  );

  server.registerTool(
    "cambiar_estado",
    {
      title: "Cambiar estado",
      description:
        "Mueve la tarea de columna. Terminado deja el turno en nadie. Un handoff solo lo cierra una persona desde la web.",
      inputSchema: z.object({
        id: z.string(),
        estado: z.enum(["por_hacer", "en_proceso", "terminado"]),
      }),
    },
    tool<{ id: string; estado: "por_hacer" | "en_proceso" | "terminado" }>(
      async ({ id, estado }, db, me) => {
        const t = await findTask(db, id);
        const { data: cur } = await db
          .from("tasks")
          .select("turn")
          .eq("id", t.id)
          .single();
        const patch =
          estado === "terminado"
            ? {
                status: estado,
                turn: "nadie" as const,
                turn_user_id: null,
                turn_third_party: null,
              }
            : cur?.turn === "nadie"
              ? {
                  status: estado,
                  turn: "persona" as const,
                  turn_user_id: me,
                  turn_third_party: null,
                }
              : { status: estado };
        const { error } = await db.from("tasks").update(patch).eq("id", t.id);
        if (error) throw dbError(error);
        return text([`${t.key} ahora está en ${STATUS_LABEL[estado]}.`]);
      },
    ),
  );

  server.registerTool(
    "pasar_turno",
    {
      title: "Pasar turno",
      description:
        'Cambia de quién es el turno: "yo", el nombre de una persona del proyecto o "tercero:<nombre>".',
      inputSchema: z.object({ id: z.string(), a: z.string() }),
    },
    tool<{ id: string; a: string }>(async ({ id, a }, db, me) => {
      const t = await findTask(db, id);
      if (t.status === "terminado")
        throw new ToolError(
          `${t.key} está terminada; muévela con cambiar_estado para reabrirla.`,
        );
      const turn = await resolveTurn(db, t.project_id, me, a);
      const { error } = await db.from("tasks").update(turn).eq("id", t.id);
      if (error) throw dbError(error);
      return text([`Turno de ${t.key} pasado a ${a}.`]);
    }),
  );
}
