/**
 * ci-coverage: todo archivo de test del repo lo ejecuta algún job de CI.
 *
 * Descubre en vez de enumerar (PLAN.md §1.4):
 *  - Los archivos salen de `git ls-files` sobre tests/ y supabase/tests/.
 *  - Lo que corre cada runner lo dice el propio runner (`vitest list`,
 *    `playwright test --list`), no una lista escrita a mano.
 *  - Que cada runner esté en un job se lee del workflow de CI.
 *
 * Lo único que no es test dentro de tests/ son los directorios de apoyo
 * (fixtures y helpers). Cualquier otro archivo tiene que ejecutarlo algún job.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const WORKFLOW = ".github/workflows/ci.yml";
const REQUIRED_JOBS = ["lint-typecheck", "unit", "db", "e2e"];
const TEST_ROOTS = ["tests", "supabase/tests"];
const SUPPORT_DIRS = ["tests/fixtures/", "tests/support/"];

/** Corre un comando del repo sin heredar el entorno del Vitest que nos ejecuta. */
function run(cmd: string, args: string[]): string {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("VITEST")) delete env[k];
  return execFileSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    env,
    stdio: "pipe",
  });
}

const rel = (abs: string) => path.relative(root, abs).split(path.sep).join("/");

function vitestFiles(): string[] {
  const out = run("pnpm", ["exec", "vitest", "list", "--filesOnly", "--json"]);
  return (JSON.parse(out) as { file: string }[]).map((t) => rel(t.file));
}

type PwSuite = { file: string; suites?: PwSuite[] };
function playwrightFiles(): string[] {
  const out = run("pnpm", [
    "exec",
    "playwright",
    "test",
    "--list",
    "--reporter=json",
  ]);
  const report = JSON.parse(out) as {
    config: { rootDir: string };
    suites: PwSuite[];
  };
  const walk = (s: PwSuite): string[] => [
    s.file,
    ...(s.suites ?? []).flatMap(walk),
  ];
  return report.suites
    .flatMap(walk)
    .map((f) => rel(path.resolve(report.config.rootDir, f)));
}

/**
 * `supabase test db` no tiene modo "listar": lanza `pg_prove -r --ext .sql --ext .pg`
 * sobre supabase/tests. Replicamos esa regla (verificada a mano en la Fase 0).
 */
function pgtapFiles(): string[] {
  return gitFiles().filter(
    (f) => f.startsWith("supabase/tests/") && /\.(sql|pg)$/.test(f),
  );
}

function gitFiles(): string[] {
  const out = run("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    ...TEST_ROOTS,
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => existsSync(path.join(root, f)));
}

type Step = { run?: string };
type Workflow = { jobs: Record<string, { steps?: Step[] }> };
const workflow = parse(
  readFileSync(path.join(root, WORKFLOW), "utf8"),
) as Workflow;
const jobRuns = (job: string) =>
  (workflow.jobs[job]?.steps ?? []).map((s) => s.run ?? "");

const runners = [
  { name: "vitest", job: "unit", command: "pnpm test", collect: vitestFiles },
  {
    name: "playwright",
    job: "e2e",
    command: "pnpm test:e2e",
    collect: playwrightFiles,
  },
  {
    name: "pgtap",
    job: "db",
    command: "supabase test db",
    collect: pgtapFiles,
  },
];

describe("ci-coverage", () => {
  it("el workflow tiene los 4 jobs requeridos", () => {
    expect(Object.keys(workflow.jobs)).toEqual(
      expect.arrayContaining(REQUIRED_JOBS),
    );
  });

  it("los scripts de package.json apuntan a su runner", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.test).toMatch(/^vitest run\b/);
    expect(pkg.scripts["test:e2e"]).toMatch(/^playwright test\b/);
  });

  it.each(runners)(
    "el job $job ejecuta $name ($command)",
    ({ job, command }) => {
      expect(
        jobRuns(job).some((r) =>
          r.split("\n").some((l) => l.trim() === command),
        ),
      ).toBe(true);
    },
  );

  it("ningún archivo de test queda huérfano", { timeout: 120_000 }, () => {
    const collected = new Map(runners.map((r) => [r.name, r.collect()]));

    // Si un runner no encuentra nada, el listado se rompió: no aceptamos un verde vacío.
    for (const [name, files] of collected) {
      expect(files.length, `${name} no recogió ningún archivo`).toBeGreaterThan(
        0,
      );
    }

    const covered = new Set([...collected.values()].flat());
    const orphans = gitFiles()
      .filter((f) => !SUPPORT_DIRS.some((d) => f.startsWith(d)))
      .filter((f) => !covered.has(f));

    expect(orphans, "archivos de test que ningún job ejecuta").toEqual([]);
  });
});
