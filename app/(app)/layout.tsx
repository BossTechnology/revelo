import { Inbox, LayoutGrid, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectMark } from "@/components/relevo/chips";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSidebar, getViewer } from "@/lib/relevo/queries";

const ROLE_LABEL: Record<string, string> = {
  desarrollo: "Desarrollo",
  arquitectura: "Arquitectura",
  otro: "Invitado",
};

/**
 * Todo lo que cuelga de (app) exige sesión. El proxy ya redirige, pero se vuelve a comprobar
 * aquí: la página no debe depender solo del proxy para proteger datos.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { projects, myTurn } = await getSidebar();
  const name = viewer.me?.display_name ?? viewer.email ?? "Tú";

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav
        aria-label="Navegación principal"
        className="flex shrink-0 flex-col gap-6 border-b bg-sidebar p-4 md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 8h12l-3-3" />
            <path d="M20 16H8l3 3" />
          </svg>
          Relevo
        </Link>

        <div className="flex flex-col gap-1 text-sm">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
          >
            <LayoutGrid className="size-4" aria-hidden />
            Proyectos
          </Link>
          <span
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground"
            title="Llega en la Fase 3"
          >
            <Inbox className="size-4" aria-hidden />
            Mi turno
            <span className="ml-auto rounded bg-secondary px-1.5 font-mono text-xs text-foreground">
              {myTurn}
            </span>
          </span>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Proyectos
          </div>
          {projects.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">
              Ninguno todavía.
            </p>
          )}
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.key}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
            >
              <ProjectMark name={p.name} color={p.color} size="sm" />
              {p.name}
              <span
                className="ml-auto font-mono text-xs text-muted-foreground"
                aria-label={`${p.open} abiertas`}
              >
                {p.open}
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t pt-4">
          <span
            aria-hidden
            style={{ backgroundColor: viewer.me?.turn_color ?? "#2E4FD0" }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          >
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">
              {ROLE_LABEL[viewer.me?.role ?? "otro"]}
            </span>
          </div>
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Salir"
              title="Salir"
            >
              <LogOut className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
