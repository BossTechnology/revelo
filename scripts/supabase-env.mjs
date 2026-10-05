/**
 * Escribe en .env.local las variables del Supabase local (`supabase status`), sin tocar las demás.
 * Se usa en local después de `supabase start` y en el job e2e de CI.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);

const vars = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  MAILPIT_URL: status.MAILPIT_URL,
};

const file = ".env.local";
const kept = existsSync(file)
  ? readFileSync(file, "utf8")
      .split("\n")
      .filter(
        (line) =>
          line && !Object.keys(vars).some((k) => line.startsWith(`${k}=`)),
      )
  : [];
const lines = [...kept, ...Object.entries(vars).map(([k, v]) => `${k}=${v}`)];
writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(`✓ ${file}: ${Object.keys(vars).join(", ")}`);
