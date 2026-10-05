import {
  BookMarked,
  Check,
  Clock,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Paperclip,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TurnChip, TypeChip } from "@/components/relevo/chips";
import {
  COLUMNS,
  TASK_TYPES,
  THIRD_PARTY_COLOR,
  dueLabel,
  relativeAge,
  turnInfo,
  type TaskType,
} from "@/lib/relevo/domain";
import { getBoard, getViewer, type BoardTask } from "@/lib/relevo/queries";
import { cn } from "@/lib/utils";

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

export async function generateMetadata({
  params,
}: PageProps<"/p/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} · Relevo` };
}

const CLOSED_LABEL: Record<TaskType, string> = {
  handoff: "Cerrada · entregada",
  pregunta: "Cerrada · respondida",
  decision: "Cerrada · firmada",
  externo: "Cerrada · resuelta",
};

export default async function BoardPage({
  params,
  searchParams,
}: PageProps<"/p/[key]">) {
  const { key } = await params;
  const { filtro } = await searchParams;
  const [viewer, board] = await Promise.all([
    getViewer(),
    getBoard(key.toUpperCase()),
  ]);
  // Un proyecto ajeno y uno inexistente se ven igual: RLS no devuelve nada.
  if (!board || !viewer) notFound();

  const { project, tasks } = board;
  const me = viewer.userId;
  const others = project.memberIds
    .filter((id) => id !== me)
    .map((id) => viewer.profiles.get(id))
    .filter((p) => p !== undefined);

  const filter = typeof filtro === "string" ? filtro : "todo";
  const matches = (t: BoardTask) =>
    filter === "todo" ||
    (filter === "mio" && t.turn === "persona" && t.turn_user_id === me) ||
    (filter === "terceros" && t.turn === "tercero") ||
    (t.turn === "persona" && t.turn_user_id === filter);

  const count = (pred: (t: BoardTask) => boolean) => tasks.filter(pred).length;
  const filters = [
    { value: "todo", label: "Todo", n: tasks.length, color: null },
    {
      value: "mio",
      label: "Lo que me toca a mí",
      n: count((t) => t.turn === "persona" && t.turn_user_id === me),
      color: viewer.me?.turn_color ?? "#2E4FD0",
    },
    ...others.map((p) => ({
      value: p.id,
      label: `Esperando a ${p.display_name}`,
      n: count((t) => t.turn === "persona" && t.turn_user_id === p.id),
      color: p.turn_color,
    })),
    {
      value: "terceros",
      label: "Terceros",
      n: count((t) => t.turn === "tercero"),
      color: THIRD_PARTY_COLOR,
    },
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <header className="flex flex-col gap-2">
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
      </header>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtrar por turno"
      >
        {filters.map((f) => {
          const active = filter === f.value;
          return (
            <Link
              key={f.value}
              href={
                f.value === "todo"
                  ? `/p/${project.key}`
                  : `/p/${project.key}?filtro=${f.value}`
              }
              aria-current={active ? "page" : undefined}
              style={f.color ? ({ "--turn": f.color } as CSSVars) : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card hover:border-foreground/40",
              )}
            >
              {f.color && (
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-[var(--turn)]"
                />
              )}
              {f.label}
              <span className="font-mono text-xs opacity-70">{f.n}</span>
            </Link>
          );
        })}
        <span
          className="ml-auto hidden flex-wrap gap-3 lg:flex"
          aria-label="Tipos de tarea"
        >
          {(Object.keys(TASK_TYPES) as TaskType[]).map((t) => (
            <TypeChip key={t} type={t} />
          ))}
        </span>
      </div>

      <section
        aria-label="Tablero"
        className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3"
      >
        {COLUMNS.map((col) => {
          const cards = tasks.filter(
            (t) => t.status === col.status && matches(t),
          );
          return (
            <div
              key={col.status}
              className="flex min-h-0 flex-col gap-3 rounded-lg bg-muted/50 p-3"
            >
              <div className="flex items-center gap-2 px-1">
                <ColumnDot status={col.status} />
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {cards.length}
                </span>
              </div>
              {cards.length === 0 && (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Nada con este filtro
                </div>
              )}
              {cards.map((t) => (
                <TaskCard key={t.id} task={t} me={me} viewer={viewer} />
              ))}
            </div>
          );
        })}
      </section>
    </main>
  );
}

function ColumnDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-3 rounded-full border-2",
        status === "por_hacer" && "border-muted-foreground",
        status === "en_proceso" &&
          "border-[#D9A400] bg-[#FFF1B8] dark:bg-[#4A3B00]",
        status === "terminado" &&
          "border-[#1F9D55] bg-[#1F9D55] dark:border-[#3FBF73] dark:bg-[#3FBF73]",
      )}
    />
  );
}

function TaskCard({
  task,
  me,
  viewer,
}: {
  task: BoardTask;
  me: string;
  viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>;
}) {
  const turn = turnInfo(task, viewer.profiles);
  const mine = turn.kind === "persona" && turn.userId === me;
  const due =
    task.dueDate && task.status !== "terminado" ? dueLabel(task.dueDate) : null;

  return (
    <article
      aria-label={`${task.key}: ${task.title}`}
      className="flex flex-col gap-2.5 rounded-lg border bg-card p-3 shadow-xs"
    >
      <div className="flex items-center gap-2">
        <TurnChip
          turn={turn}
          closedLabel={CLOSED_LABEL[task.type]}
          className="min-w-0 flex-1"
        />
        {mine && (
          <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
            Te toca
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-medium">{task.key}</span>
        {task.aliases.map((a) => (
          <span
            key={a}
            className="font-mono text-xs text-muted-foreground"
            title="ID heredado"
          >
            {a}
          </span>
        ))}
        <TypeChip type={task.type} />
      </div>

      <p className="text-sm leading-snug font-medium">{task.title}</p>

      {due && (
        <p
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
            due.overdue
              ? "bg-[#FDE8E6] text-[#B42318] dark:bg-[#3B1714] dark:text-[#FF8A80]"
              : "bg-[#FFF1D6] text-[#8A5300] dark:bg-[#3A2A0C] dark:text-[#F2C46B]",
          )}
        >
          <Clock className="size-3.5" aria-hidden />
          {due.text}
        </p>
      )}

      {task.git && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-secondary/60 px-2 py-1.5 text-xs">
          {task.git.branch && (
            <span className="inline-flex min-w-0 items-center gap-1 font-mono">
              <GitBranch className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{task.git.branch}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <GitPullRequest className="size-3.5" aria-hidden />
            {task.git.pr} {task.git.merged ? "mergeado" : "abierto"}
          </span>
          {task.git.ci && (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                task.git.ci.ok
                  ? "text-[#166534] dark:text-[#5EE08F]"
                  : "text-[#B42318] dark:text-[#FF8A80]",
              )}
            >
              {task.git.ci.ok ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              {task.git.ci.text}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span
          className="inline-flex items-center gap-1"
          aria-label={`${task.attachments} adjuntos`}
        >
          <Paperclip className="size-3.5" aria-hidden />
          {task.attachments}
        </span>
        <span
          className="inline-flex items-center gap-1"
          aria-label={`${task.replies} respuestas`}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          {task.replies}
        </span>
        <span className="ml-auto">{relativeAge(task.createdAt)}</span>
      </div>
    </article>
  );
}
