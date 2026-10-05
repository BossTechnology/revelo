"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Escape cierra el panel de detalle (salvo que el foco esté escribiendo en un campo). */
export function ClosePanelOnEscape({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role='dialog']")) return;
      router.push(href, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}
