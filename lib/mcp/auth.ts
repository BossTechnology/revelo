import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient } from "@supabase/supabase-js";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/** URL exacta del MCP: es el `resource` del documento de protected resource. */
export function mcpResourceUrl(request?: Request): string {
  if (process.env.MCP_RESOURCE_URL) return process.env.MCP_RESOURCE_URL;
  const origin = request
    ? new URL(request.url).origin
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  return `${origin}/api/mcp`;
}

export function authServerUrl(): string {
  return `${supabaseUrl()}/auth/v1`;
}

/**
 * Verifica el token de acceso que manda la IA. Solo acepta tokens emitidos por el OAuth Server
 * de Supabase para un cliente (claim client_id): un token de sesión web no sirve aquí, así lo
 * que entra por el MCP siempre queda como via = mcp y no puede firmar ni cerrar handoffs.
 */
export async function verifyMcpToken(
  _req: Request,
  bearer?: string,
): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  const supabase = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(bearer);
  if (error || !data?.claims) return undefined;
  const claims = data.claims as Record<string, unknown>;
  const clientId = claims.client_id;
  if (typeof clientId !== "string" || !clientId) return undefined;
  return {
    token: bearer,
    clientId,
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { userId: claims.sub },
  };
}
