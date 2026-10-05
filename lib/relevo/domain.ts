import type { Database } from "@/lib/supabase/database.types";

export type TaskType = Database["public"]["Enums"]["task_type"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TurnKind = Database["public"]["Enums"]["turn_kind"];

/** Tipos de tarea con su etiqueta y el color del canvas (claro / oscuro). */
export const TASK_TYPES: Record<
  TaskType,
  { label: string; light: string; dark: string }
> = {
  handoff: { label: "Handoff", light: "#7C3AED", dark: "#BCA2FF" },
  pregunta: { label: "Pregunta", light: "#0369A1", dark: "#7CC6F2" },
  decision: { label: "Decisión", light: "#047857", dark: "#62D6AC" },
  externo: { label: "Pendiente externo", light: "#9A5B00", dark: "#EDB660" },
};

export const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "por_hacer", label: "Por hacer" },
  { status: "en_proceso", label: "En proceso" },
  { status: "terminado", label: "Terminado" },
];

/** Color del turno de un tercero (el canvas usa violeta). */
export const THIRD_PARTY_COLOR = "#6A55B3";
/** Color neutro para tareas cerradas. */
export const CLOSED_COLOR = "#5F6673";

export type TurnInfo =
  | { kind: "persona"; userId: string; name: string; color: string }
  | { kind: "tercero"; name: string; color: string }
  | { kind: "nadie"; color: string };

type TurnFields = {
  turn: TurnKind;
  turn_user_id: string | null;
  turn_third_party: string | null;
};
type ProfileLite = { id: string; display_name: string; turn_color: string };

export function turnInfo(
  task: TurnFields,
  profiles: Map<string, ProfileLite>,
): TurnInfo {
  if (task.turn === "persona" && task.turn_user_id) {
    const p = profiles.get(task.turn_user_id);
    return {
      kind: "persona",
      userId: task.turn_user_id,
      name: p?.display_name ?? "Persona",
      color: p?.turn_color ?? "#2E4FD0",
    };
  }
  if (task.turn === "tercero") {
    return {
      kind: "tercero",
      name: task.turn_third_party ?? "Tercero",
      color: THIRD_PARTY_COLOR,
    };
  }
  return { kind: "nadie", color: CLOSED_COLOR };
}

/** "hace 3 h", "hace 25 días"; más de 30 días, la fecha corta ("8 sep"). */
export function relativeAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (minutes < 60) return rtf.format(-Math.max(minutes, 0), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days <= 30) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short" })
    .format(then)
    .replace(".", "");
}

/** Fecha límite legible: "Vence 6 oct · en 3 días" / "Venció 2 oct". */
export function dueLabel(
  due: string,
  now: Date = new Date(),
): { text: string; overdue: boolean } {
  const [y, m, d] = due.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const short = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(".", "");
  if (days < 0) return { text: `Venció ${short}`, overdue: true };
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  return {
    text: `Vence ${short} · ${rtf.format(days, "day")}`,
    overdue: false,
  };
}
