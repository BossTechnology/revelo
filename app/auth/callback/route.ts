import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta de Google (PKCE): cambia el `code` por la sesión. Si Supabase rechazó la cuenta
 * (registro cerrado o hook: no está invitada) vuelve con ?error=… en vez de un `code`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const reason = searchParams.has("error") ? "acceso" : "enlace";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
}
