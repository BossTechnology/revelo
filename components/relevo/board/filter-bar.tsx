"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  matchesFilter,
  type CardView,
} from "@/components/relevo/board/board-columns";
import { cn } from "@/lib/utils";

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

export function FilterBar({
  filters,
  cards,
  me,
}: {
  filters: { value: string; label: string; color: string | null }[];
  cards: CardView[];
  me: string;
}) {
  const pathname = usePathname();
  const active = useSearchParams().get("filtro") ?? "todo";

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filtrar por turno"
    >
      {filters.map((f) => {
        const isActive = active === f.value;
        const n = cards.filter((c) => matchesFilter(c, f.value, me)).length;
        return (
          <Link
            key={f.value}
            href={
              f.value === "todo" ? pathname : `${pathname}?filtro=${f.value}`
            }
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
            <span className="font-mono text-xs opacity-70">{n}</span>
          </Link>
        );
      })}
    </div>
  );
}
