/**
 * Ruta a la que volver después de entrar. Solo se aceptan rutas internas: cualquier cosa que
 * pueda salir del sitio (`//otro.com`, `/\otro.com`, `https://…`) vuelve a la portada.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/\\")
  ) {
    return "/";
  }
  // Una URL relativa a un origen ficticio no puede cambiar de origen si la ruta es interna.
  const url = new URL(raw, "http://relevo.invalid");
  if (url.origin !== "http://relevo.invalid") return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
