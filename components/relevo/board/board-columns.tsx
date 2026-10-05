"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  Check,
  Clock,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Paperclip,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { TurnChip, TypeChip } from "@/components/relevo/chips";
import { moveTask } from "@/lib/relevo/actions";
import {
  COLUMNS,
  type TaskStatus,
  type TaskType,
  type TurnInfo,
} from "@/lib/relevo/domain";
import { cn } from "@/lib/utils";

export type CardView = {
  id: string;
  key: string;
  aliases: string[];
  type: TaskType;
  title: string;
  status: TaskStatus;
  turn: TurnInfo;
  closedLabel: string;
  mine: boolean;
  due: { text: string; overdue: boolean } | null;
  git: {
    branch: string | null;
    pr: string;
    merged: boolean;
    ci: { ok: boolean; text: string } | null;
  } | null;
  replies: number;
  attachments: number;
  age: string;
};

/** Filtro por turno: "todo", "mio", "terceros" o el id de una persona ("Esperando a…"). */
export function matchesFilter(card: CardView, filter: string, me: string) {
  if (filter === "todo") return true;
  if (filter === "mio")
    return card.turn.kind === "persona" && card.turn.userId === me;
  if (filter === "terceros") return card.turn.kind === "tercero";
  return card.turn.kind === "persona" && card.turn.userId === filter;
}

/** Con teclado, ← y → saltan a la columna vecina (en vez de mover 25 px). */
const columnCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft")
    return undefined;
  event.preventDefault();
  const rects = [...context.droppableRects.entries()]
    .map(([id, rect]) => ({ id, rect }))
    .sort((a, b) => a.rect.left - b.rect.left);
  if (rects.length === 0) return undefined;
  const x = currentCoordinates.x;
  const target =
    event.code === "ArrowRight"
      ? rects.find((r) => r.rect.left > x + 1)
      : [...rects].reverse().find((r) => r.rect.left + r.rect.width < x - 1);
  if (!target) return currentCoordinates;
  return { x: target.rect.left + 16, y: target.rect.top + 16 };
};

export function BoardColumns({
  projectKey,
  cards,
  me,
}: {
  projectKey: string;
  cards: CardView[];
  me: string;
}) {
  const filter = useSearchParams().get("filtro") ?? "todo";
  const selectedKey = useParams<{ taskKey?: string }>().taskKey;
  const [, startTransition] = useTransition();
  const [optimistic, applyMove] = useOptimistic(
    cards,
    (state, move: { id: string; status: TaskStatus }) =>
      state.map((c) => (c.id === move.id ? { ...c, status: move.status } : c)),
  );

  const sensors = useSensors(
    // Un clic abre la tarjeta; arrastrar empieza después de 6 px.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const status = event.over?.id as TaskStatus | undefined;
    const card = optimistic.find((c) => c.id === event.active.id);
    if (!status || !card || card.status === status) return;
    startTransition(async () => {
      applyMove({ id: card.id, status });
      const result = await moveTask({ taskId: card.id, projectKey, status });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <DndContext
      // id fijo: sin él, dnd-kit genera ids distintos en servidor y cliente (hydration mismatch).
      id={`board-${projectKey}`}
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Para mover la tarea entre columnas: pulsa espacio, usa las flechas para elegir columna y espacio otra vez para soltarla. Escape cancela.",
        },
      }}
    >
      <section
        aria-label="Tablero"
        className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3"
      >
        {COLUMNS.map((col) => {
          const colCards = optimistic.filter(
            (c) => c.status === col.status && matchesFilter(c, filter, me),
          );
          return (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              count={colCards.length}
            >
              {colCards.length === 0 && (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Nada con este filtro
                </div>
              )}
              {colCards.map((c) => (
                <DraggableCard
                  key={c.id}
                  card={c}
                  projectKey={projectKey}
                  selected={c.key === selectedKey}
                />
              ))}
            </Column>
          );
        })}
      </section>
    </DndContext>
  );
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: TaskStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      data-column={status}
      className={cn(
        "flex min-h-24 flex-col gap-3 rounded-lg bg-muted/50 p-3 transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <ColumnDot status={status} />
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

function ColumnDot({ status }: { status: TaskStatus }) {
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

function DraggableCard({
  card,
  projectKey,
  selected,
}: {
  card: CardView;
  projectKey: string;
  selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      aria-label={`${card.key}: ${card.title}`}
      className={cn(
        "relative flex flex-col gap-2.5 rounded-lg border bg-card p-3 shadow-xs",
        selected && "border-primary ring-1 ring-primary",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <div className="flex items-center gap-2">
        <TurnChip
          turn={card.turn}
          closedLabel={card.closedLabel}
          className="min-w-0 flex-1"
        />
        {card.mine && (
          <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
            Te toca
          </span>
        )}
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Mover ${card.key}`}
          className="relative z-10 shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-medium">{card.key}</span>
        {card.aliases.map((a) => (
          <span
            key={a}
            className="font-mono text-xs text-muted-foreground"
            title="ID heredado"
          >
            {a}
          </span>
        ))}
        <TypeChip type={card.type} />
      </div>

      <Link
        href={`/p/${projectKey}/t/${card.key}`}
        scroll={false}
        className="text-sm leading-snug font-medium after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-ring"
      >
        {card.title}
      </Link>

      {card.due && (
        <p
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
            card.due.overdue
              ? "bg-[#FDE8E6] text-[#B42318] dark:bg-[#3B1714] dark:text-[#FF8A80]"
              : "bg-[#FFF1D6] text-[#8A5300] dark:bg-[#3A2A0C] dark:text-[#F2C46B]",
          )}
        >
          <Clock className="size-3.5" aria-hidden />
          {card.due.text}
        </p>
      )}

      {card.git && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-secondary/60 px-2 py-1.5 text-xs">
          {card.git.branch && (
            <span className="inline-flex min-w-0 items-center gap-1 font-mono">
              <GitBranch className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{card.git.branch}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <GitPullRequest className="size-3.5" aria-hidden />
            {card.git.pr} {card.git.merged ? "mergeado" : "abierto"}
          </span>
          {card.git.ci && (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                card.git.ci.ok
                  ? "text-[#166534] dark:text-[#5EE08F]"
                  : "text-[#B42318] dark:text-[#FF8A80]",
              )}
            >
              {card.git.ci.ok ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              {card.git.ci.text}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span
          className="inline-flex items-center gap-1"
          aria-label={`${card.attachments} adjuntos`}
        >
          <Paperclip className="size-3.5" aria-hidden />
          {card.attachments}
        </span>
        <span
          className="inline-flex items-center gap-1"
          aria-label={`${card.replies} respuestas`}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          {card.replies}
        </span>
        <span className="ml-auto">{card.age}</span>
      </div>
    </article>
  );
}
