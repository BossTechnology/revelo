import { Bot, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isAllowedMcpRedirect } from "@/lib/mcp/redirects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Autorizar acceso · Relevo" };

async function decide(formData: FormData) {
  "use server";
  const id = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "aprobar";
  const supabase = await createClient();

  if (approve) {
    // Se vuelve a validar en el servidor: no basta con ocultar el botón.
    const { data: details } =
      await supabase.auth.oauth.getAuthorizationDetails(id);
    if (
      !details ||
      !("redirect_uri" in details) ||
      !isAllowedMcpRedirect(details.redirect_uri)
    ) {
      redirect(
        `/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=destino`,
      );
    }
  }

  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id, {
        skipBrowserRedirect: true,
      })
    : await supabase.auth.oauth.denyAuthorization(id, {
        skipBrowserRedirect: true,
      });
  if (error || !data)
    redirect(
      `/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=decision`,
    );
  redirect(data.redirect_url);
}

/**
 * Pantalla de consentimiento del OAuth Server (PLAN.md §7): una IA (Claude, Claude Code) pide
 * actuar en Relevo en nombre de la persona. Muestra el cliente y su redirect URI, y solo permite
 * aprobar si el destino es uno de los aceptados.
 */
export default async function ConsentPage({
  searchParams,
}: PageProps<"/oauth/consent">) {
  const params = await searchParams;
  const authorizationId =
    typeof params.authorization_id === "string" ? params.authorization_id : "";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    redirect(
      `/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`,
    );
  }

  const { data, error } = authorizationId
    ? await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
    : { data: null, error: null };

  // Ya autorizado antes: Supabase devuelve directo la redirección.
  if (data && "redirect_url" in data) redirect(data.redirect_url);
  const details = data && "authorization_id" in data ? data : null;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-5">
          {!details || error ? (
            <p role="alert" className="text-sm">
              Esta solicitud de acceso no es válida o ya venció. Vuelve a
              conectar desde tu cliente de IA.
            </p>
          ) : (
            <Consent
              authorizationId={authorizationId}
              clientName={details.client.name || "Cliente sin nombre"}
              redirectUri={details.redirect_uri}
              scope={details.scope}
              email={details.user.email}
              error={typeof params.error === "string" ? params.error : null}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Consent({
  authorizationId,
  clientName,
  redirectUri,
  scope,
  email,
  error,
}: {
  authorizationId: string;
  clientName: string;
  redirectUri: string;
  scope: string;
  email: string;
  error: string | null;
}) {
  const allowed = isAllowedMcpRedirect(redirectUri);
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold">
            {clientName} quiere acceder a Relevo
          </h1>
          <p className="text-sm text-muted-foreground">Como {email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <p>Si apruebas, esta IA podrá, en tu nombre y solo en tus proyectos:</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>leer tareas, hilos, adjuntos y actividad de Git;</li>
          <li>crear tareas, responder, adjuntar, mover y pasar el turno.</li>
        </ul>
        <p>
          No podrá marcar decisiones como firmadas ni cerrar handoffs: eso queda
          para ti, desde la web. Puedes revocar el acceso cuando quieras en
          Ajustes → Conexiones.
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-secondary/60 p-3 text-xs">
        <dt className="text-muted-foreground">Vuelve a</dt>
        <dd className="font-mono break-all">{redirectUri}</dd>
        <dt className="text-muted-foreground">Alcance</dt>
        <dd className="font-mono">{scope || "email"}</dd>
      </dl>

      {!allowed && (
        <p
          role="alert"
          className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          Ese destino no es de Claude ni de Claude Code en tu equipo. Por
          seguridad solo puedes rechazar.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo completar la decisión. Vuelve a intentarlo desde tu cliente
          de IA.
        </p>
      )}

      <form action={decide} className="flex gap-2">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <Button
          type="submit"
          name="decision"
          value="rechazar"
          variant="outline"
          className="flex-1"
        >
          Rechazar
        </Button>
        {allowed && (
          <Button
            type="submit"
            name="decision"
            value="aprobar"
            className="flex-1"
          >
            Aprobar
          </Button>
        )}
      </form>
    </>
  );
}
