import { Clock, GitPullRequest } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProjectMark, TypeChip } from "@/components/relevo/chips";
import { RealtimeRefresh } from "@/components/relevo/realtime-refresh";
import { dueLabel, relativeAge, THIRD_PARTY_COLOR } from "@/lib/relevo/domain";
import {
  getThirdPartyList,
  getTurnList,
  getViewer,
} from "@/lib/relevo/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mi turno · Relevo" };

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

/** Tareas abiertas cuyo turno es de una persona, de todos los proyectos (PLAN.md §8). */
export default async function MyTurnPage({
  searchParams,
}: PageProps<"/mi-turno">) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const { persona } = await searchParams;
  const people = [...viewer.profiles.values()];
  const selectedId =
    typeof persona === "string" && viewer.profiles.has(persona)
      ? persona
      : viewer.userId;
  const selected = viewer.profiles.get(selectedId);

  const [rows, thirdParty, ...counts] = await Promise.all([
    getTurnList(selectedId),
    getThirdPartyList(),
    ...people.map((p) => getTurnList(p.id).then((r) => r.length)),
  ]);

  return (
    <main className="flex flex-col gap-6 p-6">
      <RealtimeRefresh />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {selectedId === viewer.userId
              ? "Mi turno"
              : `Turno de ${selected?.display_name}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ordenado por fecha límite y antigüedad, de todos los proyectos.
          </p>
        </div>
        <nav
          aria-label="Ver el turno de"
          className="flex gap-1 rounded-lg bg-secondary p-1"
        >
          {people.map((p, i) => (
            <Link
              key={p.id}
              href={
                p.id === viewer.userId
                  ? "/mi-turno"
                  : `/mi-turno?persona=${p.id}`
              }
              aria-current={p.id === selectedId ? "page" : undefined}
              style={{ "--turn": p.turn_color } as CSSVars}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
                p.id === selectedId
                  ? "bg-card shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full bg-[var(--turn)]"
              />
              {p.display_name}
              <span className="font-mono text-xs">{counts[i]}</span>
            </Link>
          ))}
        </nav>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nada pendiente para{" "}
          {selectedId === viewer.userId ? "ti" : selected?.display_name}.
        </p>
      ) : (
        <ol
          className="flex flex-col divide-y rounded-lg border bg-card"
          aria-label="Tareas con turno"
        >
          {rows.map((r) => {
            const due = r.due_date ? dueLabel(r.due_date) : null;
            const pr = r.task_git_links
              .map((l) => l.git_events)
              .find((g) => g?.kind === "pull_request");
            return (
              <li key={r.id}>
                <Link
                  href={`/p/${r.projects.key}/t/${r.key}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-secondary/50"
                >
                  <span className="flex w-28 items-center gap-2">
                    <ProjectMark
                      name={r.projects.name}
                      color={r.projects.color}
                      size="sm"
                    />
                    <span className="font-mono text-xs font-medium">
                      {r.key}
                    </span>
                  </span>
                  <TypeChip type={r.type} className="w-36" />
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {r.title}
                  </span>
                  {pr && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <GitPullRequest className="size-3.5" aria-hidden />
                      PR #{pr.pr_number}
                    </span>
                  )}
                  {due ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
                        due.overdue
                          ? "bg-[#FDE8E6] text-[#B42318] dark:bg-[#3B1714] dark:text-[#FF8A80]"
                          : "bg-[#FFF1D6] text-[#8A5300] dark:bg-[#3A2A0C] dark:text-[#F2C46B]",
                      )}
                    >
                      <Clock className="size-3.5" aria-hidden />
                      {due.text}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {relativeAge(r.created_at)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="terceros">
        <h2
          id="terceros"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: THIRD_PARTY_COLOR }}
          />
          Esperando a terceros ({thirdParty.length})
        </h2>
        {thirdParty.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {thirdParty.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/p/${t.projects.key}/t/${t.key}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-secondary/50"
                >
                  <span className="w-20 font-mono text-xs font-medium">
                    {t.key}
                  </span>
                  <span className="w-32 text-xs text-muted-foreground">
                    {t.turn_third_party}
                  </span>
                  <span className="min-w-0 flex-1">{t.title}</span>
                  {t.due_date && (
                    <span className="text-xs text-muted-foreground">
                      {dueLabel(t.due_date).text}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
