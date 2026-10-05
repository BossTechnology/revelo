import { Bot } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { relativeAge } from "@/lib/relevo/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conexiones · Relevo" };

async function revoke(formData: FormData) {
  "use server";
  const clientId = String(formData.get("client_id") ?? "");
  const supabase = await createClient();
  await supabase.auth.oauth.revokeGrant({ clientId });
  revalidatePath("/ajustes/conexiones");
}

const KIND: Record<string, string> = {
  creada: "creó",
  estado: "movió",
  turno: "pasó el turno de",
  respuesta: "respondió en",
  marca: "marcó una respuesta en",
  adjunto: "adjuntó en",
};

/**
 * Clientes de IA autorizados (PLAN.md §8): cada persona ve los suyos, puede revocarlos y ve lo
 * que hizo cada IA en su nombre (historial con via = mcp).
 */
export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  const [{ data: grants }, { data: events }] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    supabase
      .from("task_events")
      .select(
        "id, kind, to_value, created_at, tasks!inner(key, projects!inner(key))",
      )
      .eq("via", "mcp")
      .eq("actor_id", me ?? "")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <main className="flex max-w-3xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conexiones</h1>
        <p className="text-sm text-muted-foreground">
          IAs que pueden actuar en Relevo en tu nombre por MCP. Las IAs
          proponen; firmar y cerrar handoffs queda para ti.
        </p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="clientes">
        <h2 id="clientes" className="text-sm font-semibold">
          Clientes autorizados
        </h2>
        {(grants ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
            Ninguna IA conectada. Para conectar Claude, agrega un conector
            personalizado con la URL <code className="font-mono">/api/mcp</code>{" "}
            de esta app; en Claude Code,{" "}
            <code className="font-mono">
              claude mcp add --transport http relevo &lt;url&gt;/api/mcp
            </code>
            .
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {(grants ?? []).map((g) => (
              <li
                key={g.client.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Bot className="size-5 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {g.client.name || "Cliente sin nombre"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Autorizado {relativeAge(g.granted_at)} ·{" "}
                    {g.scopes.join(" ")}
                  </span>
                </div>
                <form action={revoke}>
                  <input type="hidden" name="client_id" value={g.client.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Revocar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="actividad">
        <h2 id="actividad" className="text-sm font-semibold">
          Lo que hicieron tus IAs
        </h2>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada todavía.</p>
        ) : (
          <ol className="flex flex-col gap-1.5 text-sm">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">
                  {relativeAge(e.created_at)}
                </span>
                <span>
                  {KIND[e.kind] ?? e.kind}{" "}
                  <Link
                    href={`/p/${e.tasks.projects.key}/t/${e.tasks.key}`}
                    className="font-mono underline"
                  >
                    {e.tasks.key}
                  </Link>
                  {e.kind === "adjunto" && e.to_value ? ` (${e.to_value})` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
