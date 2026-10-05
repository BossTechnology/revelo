import { NextResponse, type NextRequest } from "next/server";

/**
 * Setup URL de la GitHub App: después de instalarla, GitHub vuelve aquí con installation_id y el
 * state que pusimos en el enlace de instalación (el prefijo del proyecto). Redirige a los ajustes
 * de ese proyecto con el número de instalación ya puesto.
 */
export function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const key = (searchParams.get("state") ?? "").toUpperCase();
  const installation = searchParams.get("installation_id") ?? "";
  if (!/^[A-Z]{2,5}$/.test(key) || !/^\d+$/.test(installation)) {
    return NextResponse.redirect(new URL("/", origin));
  }
  return NextResponse.redirect(
    new URL(`/ajustes/proyecto/${key}?installation_id=${installation}`, origin),
  );
}
