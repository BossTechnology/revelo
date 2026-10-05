import { BookMarked } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BoardColumns,
  type CardView,
} from "@/components/relevo/board/board-columns";
import { FilterBar } from "@/components/relevo/board/filter-bar";
import { NewTaskDialog } from "@/components/relevo/board/new-task-dialog";
import { TypeChip } from "@/components/relevo/chips";
import { RealtimeRefresh } from "@/components/relevo/realtime-refresh";
import {
  TASK_TYPES,
  THIRD_PARTY_COLOR,
  dueLabel,
  relativeAge,
  turnInfo,
  type TaskType,
} from "@/lib/relevo/domain";
import { getBoard, getViewer } from "@/lib/relevo/queries";

const CLOSED_LABEL: Record<TaskType, string> = {
  handoff: "Cerrada · entregada",
  pregunta: "Cerrada · respondida",
  decision: "Cerrada · firmada",
  externo: "Cerrada · resuelta",
};

/**
 * El board vive en el layout para que el detalle (/p/[key]/t/[taskKey]) se abra como panel
 * lateral encima, sin perder el tablero ni el filtro.
 */
export default async function BoardLayout({
  params,
  children,
}: LayoutProps<"/p/[key]">) {
  const { key } = await params;
  const [viewer, board] = await Promise.all([
    getViewer(),
    getBoard(key.toUpperCase()),
  ]);
  // Un proyecto ajeno y uno inexistente se ven igual: RLS no devuelve nada.
  if (!board || !viewer) notFound();

  const { project, tasks } = board;
  const me = viewer.userId;
  const members = project.memberIds
    .map((id) => viewer.profiles.get(id))
    .filter((p) => p !== undefined)
    .map((p) => ({ id: p.id, name: p.display_name, color: p.turn_color }));

  const cards: CardView[] = tasks.map((t) => {
    const turn = turnInfo(t, viewer.profiles);
    return {
      id: t.id,
      key: t.key,
      aliases: t.aliases,
      type: t.type,
      title: t.title,
      status: t.status,
      turn,
      closedLabel: CLOSED_LABEL[t.type],
      mine: turn.kind === "persona" && turn.userId === me,
      due: t.dueDate && t.status !== "terminado" ? dueLabel(t.dueDate) : null,
      git: t.git,
      replies: t.replies,
      attachments: t.attachments,
      age: relativeAge(t.createdAt),
    };
  });

  const filters = [
    { value: "todo", label: "Todo", color: null },
    {
      value: "mio",
      label: "Lo que me toca a mí",
      color: viewer.me?.turn_color ?? "#2E4FD0",
    },
    ...members
      .filter((m) => m.id !== me)
      .map((m) => ({
        value: m.id,
        label: `Esperando a ${m.name}`,
        color: m.color,
      })),
    { value: "terceros", label: "Terceros", color: THIRD_PARTY_COLOR },
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <RealtimeRefresh projectId={project.id} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <nav aria-label="Ruta" className="text-sm text-muted-foreground">
            <Link href="/" className="hover:underline">
              Proyectos
            </Link>{" "}
            / {project.name}
          </nav>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            {project.repos.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs"
              >
                <BookMarked className="size-3" aria-hidden />
                {r}
              </span>
            ))}
            {project.lastActivity && (
              <span className="text-xs text-muted-foreground">
                Última actividad: {project.lastActivity}
              </span>
            )}
          </div>
        </div>
        <NewTaskDialog
          projectId={project.id}
          projectKey={project.key}
          members={members.map(({ id, name }) => ({ id, name }))}
          me={me}
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterBar filters={filters} cards={cards} me={me} />
        <span
          className="ml-auto hidden flex-wrap gap-3 lg:flex"
          aria-label="Tipos de tarea"
        >
          {(Object.keys(TASK_TYPES) as TaskType[]).map((t) => (
            <TypeChip key={t} type={t} />
          ))}
        </span>
      </div>

      <BoardColumns projectKey={project.key} cards={cards} me={me} />
      {children}
    </main>
  );
}
