const CHECKBOX_LINE = /^(\s*(?:[-*+]|\d+\.)\s+\[)( |x|X)(\])/;

/** Marca o desmarca la casilla número `index` del markdown (report-back como checklist). */
export function toggleChecklistItem(markdown: string, index: number): string {
  let seen = -1;
  return markdown
    .split("\n")
    .map((line) => {
      if (!CHECKBOX_LINE.test(line)) return line;
      seen++;
      if (seen !== index) return line;
      return line.replace(
        CHECKBOX_LINE,
        (_, open: string, mark: string, close: string) =>
          `${open}${mark.trim() ? " " : "x"}${close}`,
      );
    })
    .join("\n");
}
