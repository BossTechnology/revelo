/**
 * Migración del Google Doc (PLAN.md §9, Fase 3): carga los pendientes abiertos con sus IDs
 * viejos como alias (N-05, N-07…), para que se puedan seguir buscando por el ID de siempre.
 *
 *   pnpm import-doc pendientes.json            # muestra lo que haría
 *   pnpm import-doc pendientes.json --aplicar  # lo carga
 *
 * Formato de pendientes.json:
 *   [
 *     {
 *       "proyecto": "BOB",            // prefijo del proyecto (ya creado)
 *       "alias": ["N-05"],            // IDs viejos (opcional)
 *       "tipo": "pregunta",           // handoff | pregunta | decision | externo
 *       "titulo": "…",
 *       "cuerpo": "…",                // markdown (opcional)
 *       "turno": "f@boss.technology", // correo de una persona, o "tercero:platform team"
 *       "estado": "por_hacer",        // opcional: por_hacer | en_proceso
 *       "fecha_limite": "2026-10-20", // opcional
 *       "creado": "2026-09-07"        // opcional: fecha original en el Doc
 *     }
 *   ]
 *
 * Usa SUPABASE_SECRET_KEY (script de servidor, como pnpm invite): las tareas entran con
 * via 'sistema' en el historial, y conservan la fecha original si se indica. Si un alias ya
 * existe en el proyecto (o, sin alias, el mismo título), esa entrada se salta: se puede correr
 * dos veces sin duplicar.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/supabase/database.types";

type Item = {
  proyecto: string;
  alias?: string[];
  tipo: "handoff" | "pregunta" | "decision" | "externo";
  titulo: string;
  cuerpo?: string;
  turno: string;
  estado?: "por_hacer" | "en_proceso";
  fecha_limite?: string;
  creado?: string;
};

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { aplicar: { type: "boolean", default: false } },
});
const file = positionals[0];
if (!file) fail("Uso: pnpm import-doc <pendientes.json> [--aplicar]");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey)
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");
const admin = createClient<Database>(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const items = JSON.parse(readFileSync(file, "utf8")) as Item[];
if (!Array.isArray(items)) fail("El archivo debe ser una lista de pendientes.");

const { data: projects } = await admin.from("projects").select("id, key");
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const userByEmail = new Map(
  (users?.users ?? []).map((u) => [u.email?.toLowerCase(), u.id]),
);
const fallbackCreator = users?.users[0]?.id;
if (!fallbackCreator)
  fail("No hay personas en este entorno: invita primero con pnpm invite.");

let created = 0;
let skipped = 0;
for (const [i, item] of items.entries()) {
  const where = `#${i + 1} (${item.alias?.join(", ") || item.titulo})`;
  const project = projects?.find((p) => p.key === item.proyecto?.toUpperCase());
  if (!project) fail(`${where}: no existe el proyecto ${item.proyecto}.`);
  if (!["handoff", "pregunta", "decision", "externo"].includes(item.tipo))
    fail(`${where}: tipo no válido.`);
  if (!item.titulo?.trim()) fail(`${where}: falta el título.`);

  const turn = item.turno.startsWith("tercero:")
    ? {
        turn: "tercero" as const,
        turn_user_id: null,
        turn_third_party: item.turno.slice(8).trim(),
      }
    : {
        turn: "persona" as const,
        turn_user_id: userByEmail.get(item.turno.toLowerCase()) ?? null,
        turn_third_party: null,
      };
  if (turn.turn === "persona" && !turn.turn_user_id)
    fail(`${where}: ${item.turno} no está invitado en este entorno.`);

  // Ya cargada: mismo alias, o (sin alias) mismo título en el proyecto.
  {
    const query = admin
      .from("tasks")
      .select("key")
      .eq("project_id", project.id)
      .limit(1);
    const { data: existing } = item.alias?.length
      ? await query.overlaps("aliases", item.alias)
      : await query.eq("title", item.titulo.trim());
    if (existing?.length) {
      console.log(`· ${where}: ya existe como ${existing[0]!.key}, se salta.`);
      skipped++;
      continue;
    }
  }

  const createdAt = item.creado
    ? new Date(item.creado).toISOString()
    : new Date().toISOString();
  const row: Database["public"]["Tables"]["tasks"]["Insert"] = {
    project_id: project.id,
    number: 0,
    key: "",
    aliases: item.alias ?? [],
    type: item.tipo,
    title: item.titulo.trim(),
    body: item.cuerpo ?? "",
    status: (item.estado ?? "por_hacer") as "por_hacer" | "en_proceso",
    due_date: item.fecha_limite ?? null,
    created_by: turn.turn_user_id ?? fallbackCreator,
    created_via: "web",
    created_at: createdAt,
    updated_at: createdAt,
    ...turn,
  };

  if (!values.aplicar) {
    console.log(
      `→ ${where}: ${project.key} · ${row.type} · turno ${item.turno}`,
    );
    continue;
  }
  const { data, error } = await admin
    .from("tasks")
    .insert(row)
    .select("key")
    .single();
  if (error) fail(`${where}: ${error.message}`);
  console.log(`✓ ${where} → ${data.key}`);
  created++;
}

console.log(
  values.aplicar
    ? `Listo: ${created} creadas, ${skipped} ya existían.`
    : `Simulación: ${items.length - skipped} por crear, ${skipped} ya existen. Agrega --aplicar para cargarlas.`,
);
