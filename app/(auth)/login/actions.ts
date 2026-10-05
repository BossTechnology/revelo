"use server";

import { requestOrigin } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

export type MagicLinkState =
  { status: "idle" } | { status: "sent" } | { status: "invalid" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pide el enlace mágico. La respuesta es siempre la misma ("sent") exista o no la cuenta:
 * el formulario no revela qué correos están invitados. Con shouldCreateUser: false, un correo
 * no invitado no crea cuenta ni recibe correo.
 */
export async function sendMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: "invalid" };

  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const redirect = new URL("/auth/confirm", await requestOrigin());
  redirect.searchParams.set("next", next);

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirect.toString() },
  });

  return { status: "sent" };
}
