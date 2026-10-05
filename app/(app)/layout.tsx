import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

/**
 * Todo lo que cuelga de (app) exige sesión. El proxy ya redirige, pero se vuelve a comprobar
 * aquí: la página no debe depender solo del proxy para proteger datos.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 items-center justify-between border-b bg-card px-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded bg-primary font-mono text-xs text-primary-foreground"
          >
            R
          </span>
          Relevo
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-sm text-muted-foreground">
            {profile?.display_name ?? data?.claims.email}
          </span>
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
