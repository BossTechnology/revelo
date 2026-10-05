import "server-only";

import { createSign } from "node:crypto";

/**
 * Autenticación como GitHub App (PLAN.md §6): JWT firmado con la clave privada de la app
 * (RS256, 9 minutos) → token de instalación de corta duración, de solo lectura por los permisos
 * de la app (Metadata, Contents, Pull requests, Checks).
 */
const API = "https://api.github.com";

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function appJwt(
  appId: string,
  privateKeyPem: string,
  now = Math.floor(Date.now() / 1000),
) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat 60 s atrás por si el reloj de GitHub va adelantado; máximo 10 minutos de vida.
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(privateKeyPem.replace(/\\n/g, "\n")));
  return `${header}.${payload}.${signature}`;
}

async function gh<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...init?.headers,
    },
  });
  if (!res.ok)
    throw new Error(`GitHub ${res.status} en ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function installationToken(
  installationId: number,
): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !key)
    throw new Error("Faltan GITHUB_APP_ID o GITHUB_APP_PRIVATE_KEY.");
  const { token } = await gh<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt(appId, key),
    {
      method: "POST",
    },
  );
  return token;
}

export type PullRequest = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged_at: string | null;
  html_url: string;
  updated_at: string;
  head: { ref: string; sha: string };
};

export function recentPullRequests(owner: string, repo: string, token: string) {
  return gh<PullRequest[]>(
    `/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=30`,
    token,
  );
}

export type CheckSuite = {
  id: number;
  head_branch: string | null;
  head_sha: string;
  status: string;
  conclusion: string | null;
  updated_at: string;
  url: string;
  pull_requests: { number: number }[];
  app?: { name?: string };
};

export async function checkSuitesFor(
  owner: string,
  repo: string,
  sha: string,
  token: string,
) {
  const { check_suites } = await gh<{ check_suites: CheckSuite[] }>(
    `/repos/${owner}/${repo}/commits/${sha}/check-suites`,
    token,
  );
  return check_suites;
}
