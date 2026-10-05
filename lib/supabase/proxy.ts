import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Rutas que no exigen sesión web. El MCP y su metadata se autentican con el token OAuth de la IA
 * (withMcpAuth responde 401 con WWW-Authenticate); todo lo demás exige haber entrado.
 */
const PUBLIC_PATHS = ["/login", "/auth/", "/api/mcp", "/.well-known/"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) =>
    p.endsWith("/")
      ? pathname.startsWith(p)
      : pathname === p || pathname.startsWith(`${p}/`),
  );

/**
 * Refresca la sesión en cada request y redirige a /login si la ruta es protegida y no hay
 * sesión, guardando la ruta original en ?next= para volver después de entrar.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // No meter código entre createServerClient y getClaims: es lo que refresca el token.
  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;

  if (!data?.claims && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return response;
}
