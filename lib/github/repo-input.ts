/**
 * Lo que alguien escribe en "Conectar repo": `organización/repo` o la URL que copió de GitHub
 * (https://github.com/org/repo, con o sin .git, barra final, /tree/main…, o git@github.com:org/repo).
 */
export function parseRepoInput(
  input: string,
): { owner: string; repo: string } | null {
  let s = input.trim();
  s = s.replace(/^git@github\.com:/i, "");
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  const [owner, rawRepo] = s.split(/[/?#]/);
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo))
    return null;
  return { owner, repo };
}
