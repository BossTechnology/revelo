import { BookMarked, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProjectMark } from "@/components/relevo/chips";
import { NewProjectDialog } from "@/components/relevo/new-project-dialog";
import { THIRD_PARTY_COLOR } from "@/lib/relevo/domain";
import { getProjectsOverview, getViewer } from "@/lib/relevo/queries";

export const metadata: Metadata = { title: "Proyectos · Relevo" };

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

export default async function ProjectsPage() {
  const [viewer, projects] = await Promise.all([
    getViewer(),
    getProjectsOverview(),
  ]);
  const people = [...(viewer?.profiles.values() ?? [])];
  const me = viewer?.userId;

  const totals = new Map<string, number>();
  let thirdParty = 0;
  for (const p of projects) {
    for (const [id, n] of p.waitingFor)
      totals.set(id, (totals.get(id) ?? 0) + n);
    thirdParty += p.thirdParty;
  }
  const others = people.filter((p) => p.id !== me && totals.has(p.id));

  return (
    <main className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 1
              ? "1 proyecto activo"
              : `${projects.length} proyectos activos`}
          </p>
        </div>
        {projects.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Pill
              color={viewer?.me?.turn_color ?? "#2E4FD0"}
              label={`Te toca · ${totals.get(me ?? "") ?? 0}`}
            />
            {others.map((p) => (
              <Pill
                key={p.id}
                color={p.turn_color}
                label={`Esperando a ${p.display_name} · ${totals.get(p.id)}`}
              />
            ))}
            <Pill
              color={THIRD_PARTY_COLOR}
              label={`Terceros · ${thirdParty}`}
            />
          </div>
        )}
        <NewProjectDialog
          people={people.map((p) => ({ id: p.id, name: p.display_name }))}
          me={me ?? ""}
        />
      </header>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aún no estás en ningún proyecto. Pide a quien lo administra que te
          agregue.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/p/${p.key}`}
                className="flex h-full flex-col gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-center gap-3">
                  <ProjectMark name={p.name} color={p.color} />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold">{p.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.key}
                    </span>
                  </div>
                </div>

                {p.repos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.repos.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs"
                      >
                        <BookMarked className="size-3" aria-hidden />
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div
                    className="flex h-1.5 overflow-hidden rounded-full bg-secondary"
                    aria-hidden
                  >
                    <span
                      className="bg-muted-foreground/50"
                      style={{ width: pct(p.byStatus.por_hacer, p.total) }}
                    />
                    <span
                      className="bg-[#E0A800]"
                      style={{ width: pct(p.byStatus.en_proceso, p.total) }}
                    />
                    <span
                      className="bg-[#1F9D55] dark:bg-[#3FBF73]"
                      style={{ width: pct(p.byStatus.terminado, p.total) }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Por hacer{" "}
                      <strong className="text-foreground">
                        {p.byStatus.por_hacer}
                      </strong>
                    </span>
                    <span>
                      En proceso{" "}
                      <strong className="text-foreground">
                        {p.byStatus.en_proceso}
                      </strong>
                    </span>
                    <span>
                      Terminado{" "}
                      <strong className="text-foreground">
                        {p.byStatus.terminado}
                      </strong>
                    </span>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {people.map((person) => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between rounded-md bg-secondary/60 px-2 py-1.5"
                    >
                      <dt className="text-muted-foreground">
                        Esperando a {person.display_name}
                      </dt>
                      <dd className="font-mono font-semibold">
                        {p.waitingFor.get(person.id) ?? 0}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden />
                    {p.lastActivity ?? "Sin actividad"}
                  </span>
                  {p.thirdParty > 0 && <span>{p.thirdParty} con terceros</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function pct(n: number, total: number) {
  return total ? `${(n / total) * 100}%` : "0%";
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{ "--turn": color } as CSSVars}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-medium"
    >
      <span aria-hidden className="size-2 rounded-full bg-[var(--turn)]" />
      {label}
    </span>
  );
}
