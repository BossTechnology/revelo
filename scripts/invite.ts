/**
 * Invita a una persona a Relevo (PLAN.md §4).
 *
 *   pnpm invite <correo> --nombre "Federico" --rol arquitectura [--sitio https://relevo.dominio]
 *
 * 1. Agrega el correo (normalizado) a allowed_emails: sin esto el hook rechaza la cuenta.
 * 2. Crea la cuenta con inviteUserByEmail, con nombre y rol en los metadatos. El trigger
 *    handle_new_user crea el perfil con esos datos.
 *
 * Usa SUPABASE_SECRET_KEY: es un script de servidor, nunca se ejecuta en el navegador ni en el MCP.
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY del entorno (pnpm invite carga .env.local).
 */
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

const ROLES = ["desarrollo", "arquitectura", "otro"] as const;
type Role = (typeof ROLES)[number];

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    nombre: { type: "string" },
    rol: { type: "string" },
    sitio: { type: "string" },
  },
});

const email = positionals[0]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail(
    'Uso: pnpm invite <correo> --nombre "Nombre" --rol desarrollo|arquitectura|otro',
  );
}
const name = values.nombre?.trim();
if (!name) fail("Falta --nombre.");
const role = values.rol as Role | undefined;
if (!role || !ROLES.includes(role))
  fail(`--rol debe ser uno de: ${ROLES.join(", ")}.`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey)
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");

const site =
  values.sitio ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const redirectTo = new URL("/auth/confirm", site);
redirectTo.searchParams.set("next", "/");

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error: allowError } = await admin
  .from("allowed_emails")
  .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
if (allowError)
  fail(`No se pudo agregar a allowed_emails: ${allowError.message}`);

const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  data: { display_name: name, role },
  redirectTo: redirectTo.toString(),
});
if (error) fail(`No se pudo invitar a ${email}: ${error.message}`);

console.log(
  `✓ Invitación enviada a ${email} (${name}, ${role}). Usuario ${data.user.id}.`,
);
