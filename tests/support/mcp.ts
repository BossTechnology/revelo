import { createHash, randomBytes } from "node:crypto";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createClient } from "@supabase/supabase-js";

import { magicLinkTokenHash } from "./auth";

const SUPABASE = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const REDIRECT = "http://127.0.0.1:43123/callback";

const b64url = (buf: Buffer) => buf.toString("base64url");

/**
 * Token real del OAuth 2.1 Server local para `email`, como lo obtendría Claude:
 * registro dinámico → /oauth/authorize → la persona aprueba (/oauth/consent) → /oauth/token.
 * El token trae el claim client_id, así que todo lo que haga queda como via = mcp.
 */
export async function mcpAccessToken(email: string, redirectUri = REDIRECT) {
  const reg = await fetch(`${SUPABASE()}/auth/v1/oauth/clients/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude (test)",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  if (!reg.ok)
    throw new Error(
      `Registro dinámico falló: ${reg.status} ${await reg.text()}`,
    );
  const { client_id: clientId } = (await reg.json()) as { client_id: string };

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const authorize = new URL(`${SUPABASE()}/auth/v1/oauth/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "prueba",
  }).toString();
  const redirect = await fetch(authorize, { redirect: "manual" });
  const location = redirect.headers.get("location");
  const authorizationId = location
    ? new URL(location).searchParams.get("authorization_id")
    : null;
  if (!authorizationId)
    throw new Error(
      `/oauth/authorize no redirigió al consentimiento: ${redirect.status} ${location}`,
    );

  // La persona, con su sesión, aprueba (lo que hace el botón de /oauth/consent).
  const person = createClient(
    SUPABASE(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error: otpError } = await person.auth.verifyOtp({
    type: "magiclink",
    token_hash: await magicLinkTokenHash(email),
  });
  if (otpError) throw otpError;
  // Como /oauth/consent: primero leer el detalle (asocia la autorización a la persona), luego aprobar.
  const { error: detailsError } =
    await person.auth.oauth.getAuthorizationDetails(authorizationId);
  if (detailsError) throw detailsError;
  const { data: approval, error: approveError } =
    await person.auth.oauth.approveAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });
  if (approveError) throw approveError;
  const code = new URL(approval.redirect_url).searchParams.get("code");
  if (!code) throw new Error(`Sin código en ${approval.redirect_url}`);

  const tokenRes = await fetch(`${SUPABASE()}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok)
    throw new Error(
      `Canje del código falló: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  const { access_token: accessToken } = (await tokenRes.json()) as {
    access_token: string;
  };
  return { accessToken, clientId, authorizationId };
}

/** Cliente MCP oficial contra /api/mcp con el token dado. */
export async function mcpClient(baseURL: string, accessToken: string) {
  const client = new Client({ name: "relevo-tests", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("/api/mcp", baseURL),
    {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
  await client.connect(transport);
  return client;
}

/** Texto de la respuesta de una herramienta. */
export function toolText(result: unknown): string {
  const content =
    (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((c) => c.text ?? "").join("\n");
}
