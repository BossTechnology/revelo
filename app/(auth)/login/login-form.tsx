"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

import { sendMagicLink, type MagicLinkState } from "./actions";

export function LoginForm({
  next,
  linkError,
}: {
  next: string;
  linkError: boolean;
}) {
  const [state, formAction, sending] = useActionState<MagicLinkState, FormData>(
    sendMagicLink,
    {
      status: "idle",
    },
  );
  const [googleError, setGoogleError] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  async function signInWithGoogle() {
    setGoogleError(false);
    setGooglePending(true);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", next);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) {
      setGoogleError(true);
      setGooglePending(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        {linkError && (
          <p role="alert" className="rounded-md bg-muted px-3 py-2 text-sm">
            El enlace no es válido o ya venció. Pide uno nuevo.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={signInWithGoogle}
          disabled={googlePending}
        >
          <GoogleIcon />
          Entrar con Google
        </Button>
        {googleError && (
          <p role="alert" className="text-sm text-destructive">
            No se pudo abrir el inicio de sesión con Google. Intenta con el
            enlace por correo.
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />o con un enlace por correo
          <Separator className="flex-1" />
        </div>

        {state.status === "sent" ? (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
            Si tu correo está invitado, te llegó un enlace para entrar. Revisa
            tu bandeja.
          </p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3" noValidate>
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                required
                aria-invalid={state.status === "invalid" || undefined}
                aria-describedby={
                  state.status === "invalid" ? "email-error" : undefined
                }
              />
              {state.status === "invalid" && (
                <p id="email-error" className="text-sm text-destructive">
                  Escribe un correo válido.
                </p>
              )}
            </div>
            <Button type="submit" disabled={sending}>
              {sending ? "Enviando…" : "Enviarme un enlace"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
