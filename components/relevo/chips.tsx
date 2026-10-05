import { Check } from "lucide-react";

import { TASK_TYPES, type TaskType, type TurnInfo } from "@/lib/relevo/domain";
import { cn } from "@/lib/utils";

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

/**
 * Indicador de turno: siempre con el nombre (nunca solo color, PLAN.md §8). El color de la
 * persona tiñe el fondo con color-mix para que funcione igual en claro y en oscuro.
 */
export function TurnChip({
  turn,
  closedLabel,
  className,
}: {
  turn: TurnInfo;
  closedLabel?: string;
  className?: string;
}) {
  const text =
    turn.kind === "persona"
      ? `Turno: ${turn.name}`
      : turn.kind === "tercero"
        ? `Turno: Tercero · ${turn.name}`
        : (closedLabel ?? "Cerrada");
  const initial =
    turn.kind === "persona"
      ? turn.name.charAt(0)
      : turn.kind === "tercero"
        ? "T"
        : null;

  return (
    <span
      style={{ "--turn": turn.color } as CSSVars}
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold",
        "bg-[color-mix(in_oklab,var(--turn)_16%,var(--card))] text-[color-mix(in_oklab,var(--turn)_70%,var(--foreground))] dark:text-[color-mix(in_oklab,var(--turn)_40%,var(--foreground))]",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--turn)] text-[11px] font-semibold text-white"
      >
        {initial ?? <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}

export function TypeChip({
  type,
  className,
}: {
  type: TaskType;
  className?: string;
}) {
  const t = TASK_TYPES[type];
  return (
    <span
      style={{ "--type-l": t.light, "--type-d": t.dark } as CSSVars}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-[var(--type-l)] dark:text-[var(--type-d)]",
        className,
      )}
    >
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {t.label}
    </span>
  );
}

export function ProjectMark({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-mono font-semibold text-white",
        size === "md" ? "size-9 text-sm" : "size-2.5 rounded-full",
      )}
    >
      {size === "md" ? name.charAt(0) : null}
    </span>
  );
}
