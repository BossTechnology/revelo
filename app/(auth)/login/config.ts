/**
 * El enlace mágico necesita SMTP. Donde no hay (hoy: producción en relevo-bosstechnology), se
 * apaga con RELEVO_MAGIC_LINK=off y solo se entra con Google. Se lee en el servidor, en cada
 * request, para no depender del valor del build.
 */
export function magicLinkEnabled(): boolean {
  return process.env.RELEVO_MAGIC_LINK !== "off";
}
