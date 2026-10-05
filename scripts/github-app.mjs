/**
 * Crea la GitHub App "Relevo" con el flujo de manifest de GitHub (PLAN.md §6), sin copiar claves
 * a mano:
 *
 *   node scripts/github-app.mjs https://relevo-bosstechnology.vercel.app [.env.staging.local]
 *
 * 1. Abre http://localhost:8765 en el navegador donde tienes la sesión de la cuenta u
 *    organización dueña, y pulsa "Create GitHub App" en GitHub.
 * 2. GitHub vuelve a http://localhost:8765/callback con un código de un solo uso; el script lo
 *    canjea por el id, el slug, la clave privada y el secreto del webhook, y los escribe en el
 *    archivo indicado (no se imprimen).
 *
 * La app queda con permisos de solo lectura (Metadata, Contents, Pull requests, Checks), los
 * eventos push, pull_request y check_suite, y es instalable en otras organizaciones.
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";

const site = process.argv[2];
const envFile = process.argv[3] ?? ".env.staging.local";
if (!site?.startsWith("https://")) {
  console.error("Uso: node scripts/github-app.mjs https://<app> [archivo-env]");
  process.exit(1);
}
const PORT = 8765;

const manifest = {
  name: "Relevo",
  url: site,
  description:
    "Vincula ramas, commits, PRs y CI a las tareas de Relevo por el ID (BOB-14).",
  hook_attributes: { url: `${site}/api/github/webhook`, active: true },
  redirect_url: `http://localhost:${PORT}/callback`,
  setup_url: `${site}/ajustes/github`,
  setup_on_update: true,
  public: true,
  default_permissions: {
    metadata: "read",
    contents: "read",
    pull_requests: "read",
    checks: "read",
  },
  default_events: ["push", "pull_request", "check_suite"],
};

const escapeHtml = (s) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

function upsertEnv(vars) {
  const lines = existsSync(envFile)
    ? readFileSync(envFile, "utf8").split("\n")
    : [];
  const kept = lines.filter(
    (l) => !Object.keys(vars).some((k) => l.startsWith(`${k}=`)),
  );
  writeFileSync(envFile, kept.join("\n").replace(/\n*$/, "\n"), {
    mode: 0o600,
  });
  appendFileSync(
    envFile,
    `\n# GitHub App (creada con scripts/github-app.mjs)\n`,
  );
  for (const [k, v] of Object.entries(vars))
    appendFileSync(envFile, `${k}=${v}\n`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Crear GitHub App Relevo</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto">
<h1>Crear la GitHub App "Relevo"</h1>
<p>Con la sesión de la cuenta u organización dueña abierta en este navegador, pulsa el botón. GitHub te mostrará la configuración y un botón final <b>Create GitHub App</b>.</p>
<form action="https://github.com/settings/apps/new?state=relevo" method="post">
<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<button type="submit" style="font-size:1.1rem;padding:.6rem 1rem">Ir a GitHub</button>
</form></body>`);
    return;
  }
  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("Falta el código.");
      return;
    }
    const r = await fetch(
      `https://api.github.com/app-manifests/${code}/conversions`,
      {
        method: "POST",
        headers: { accept: "application/vnd.github+json" },
      },
    );
    if (!r.ok) {
      res.writeHead(500).end(`GitHub respondió ${r.status}`);
      console.error(`✗ Canje del código: ${r.status} ${await r.text()}`);
      server.close();
      return;
    }
    const app = await r.json();
    upsertEnv({
      GITHUB_APP_ID: String(app.id),
      NEXT_PUBLIC_GITHUB_APP_SLUG: app.slug,
      GITHUB_APP_PRIVATE_KEY: app.pem.trim().replaceAll("\n", "\\n"),
      GITHUB_WEBHOOK_SECRET: app.webhook_secret,
    });
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:40rem;margin:4rem auto">
<h1>Listo</h1><p>La app <b>${escapeHtml(app.slug)}</b> quedó creada. Puedes cerrar esta pestaña y volver a Claude Code.</p></body>`);
    console.log(
      `✓ GitHub App ${app.slug} (id ${app.id}) creada; credenciales en ${envFile}.`,
    );
    server.close();
  }
});

server.listen(PORT, () =>
  console.log(
    `Abre http://localhost:${PORT} en el navegador con la sesión de GitHub dueña.`,
  ),
);
