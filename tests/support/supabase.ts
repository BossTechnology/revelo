import { createClient } from "@supabase/supabase-js";

/** Cliente admin contra el Supabase local de los tests (variables de `pnpm env:local`). */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("Faltan variables de Supabase: corre `pnpm env:local`.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Correo único por test, en un dominio reservado que nunca entrega correo real. */
export function testEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@relevo.test`;
}

/** Invita como lo hace scripts/invite.mts, pero sin enviar el correo de invitación. */
export async function createInvitedUser(
  email: string,
  displayName = "Persona E2E",
) {
  const admin = adminClient();
  const { error: allowError } = await admin
    .from("allowed_emails")
    .insert({ email });
  if (allowError) throw allowError;
  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName, role: "otro" },
  });
  if (error) throw error;
}

export async function userExists(email: string) {
  const { data, error } = await adminClient().auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) throw error;
  return data.users.some((u) => u.email === email);
}
