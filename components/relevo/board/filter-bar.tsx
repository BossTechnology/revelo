"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  matchesCategory,
  matchesFilter,
  type CardView,
} from "@/components/relevo/board/board-columns";
import { cn } from "@/lib/utils";

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

/**
 * Chips de filtro del tablero. Hay dos grupos que se combinan: por turno (`?filtro=`) y, si el
 * proyecto tiene categorías, por categoría (`?categoria=`). Cada chip cuenta las tarjetas que
 * quedarían visibles con el otro filtro tal como está.
 */
export function FilterBar({
  kind,
  filters,
  cards,
  me,
}: {
  kind: "turno" | "categoria";
  filters: { value: string; label: string; color: string | null }[];
  cards: CardView[];
  me: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const param = kind === "turno" ? "filtro" : "categoria";
  const fallback = kind === "turno" ? "todo" : "todas";
  const active = params.get(param) ?? fallback;
  const turn = params.get("filtro") ?? "todo";
  const category = params.get("categoria") ?? "todas";

  function href(value: string) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(param);
    else next.set(param, value);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function count(value: string) {
    return cards.filter((c) =>
      kind === "turno"
        ? matchesFilter(c, value, me) && matchesCategory(c, category)
        : matchesCategory(c, value) && matchesFilter(c, turn, me),
    ).length;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={
        kind === "turno" ? "Filtrar por turno" : "Filtrar por categoría"
      }
    >
      {filters.map((f) => {
        const isActive = active === f.value;
        return (
          <Link
            key={f.value}
            href={href(f.value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            style={f.color ? ({ "--turn": f.color } as CSSVars) : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              isActive
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
            <span className="font-mono text-xs opacity-70">
              {count(f.value)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
