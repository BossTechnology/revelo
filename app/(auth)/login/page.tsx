import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Relevo" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );
  const error =
    params.error === "enlace" || params.error === "acceso"
      ? params.error
      : null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect(next);

  return (
    <div className="relative flex flex-1 items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-lg bg-primary font-mono text-base font-semibold text-primary-foreground"
          >
            R
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Entrar a Relevo
          </h1>
          <p className="text-sm text-muted-foreground">
            Solo para personas invitadas.
          </p>
        </div>
        <LoginForm next={next} error={error} />
      </main>
    </div>
  );
}
