/**
 * IDs de tarea en texto de Git (PLAN.md §6): /\b([A-Z]{2,5})-(\d+)\b/.
 *
 * - Commits, títulos y cuerpos de PR: el ID va en mayúsculas ("BOB-14 corrige…").
 * - Ramas: la convención es en minúsculas ("bob-14-descripcion"), así que en la rama se busca
 *   sin distinguir mayúsculas.
 * Solo cuenta el prefijo del proyecto dueño del repo: un MOM-3 mencionado en el repo de BOb
 * no se vincula.
 */
const ID = /\b([A-Z]{2,5})-(\d+)\b/g;

export type Source = "branch" | "commit" | "pr_title" | "pr_body";

export function extractIds(
  text: string | null | undefined,
  projectKey: string,
  source: Source,
): string[] {
  if (!text) return [];
  const haystack = source === "branch" ? text.toUpperCase() : text;
  const found = new Set<string>();
  for (const m of haystack.matchAll(ID)) {
    const [, prefix, number] = m;
    if (prefix === projectKey && Number(number) > 0)
      found.add(`${prefix}-${Number(number)}`);
  }
  return [...found];
}

/** Todos los IDs del proyecto en un evento, con dónde se encontró cada uno (el primero gana). */
export function linksFor(
  projectKey: string,
  parts: { source: Source; text: string | null | undefined }[],
): Map<string, Source> {
  const links = new Map<string, Source>();
  for (const { source, text } of parts) {
    for (const id of extractIds(text, projectKey, source))
      if (!links.has(id)) links.set(id, source);
  }
  return links;
}
