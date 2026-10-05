import { headers } from "next/headers";

/**
 * Origen público del request (localhost, preview de Vercel o producción). Los enlaces de los
 * correos vuelven a este origen, que además tiene que estar en las Redirect URLs de Supabase.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("No se pudo determinar el origen del request.");
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
