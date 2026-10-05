import { metadataCorsOptionsRequestHandler } from "mcp-handler";

import { authServerUrl, mcpResourceUrl } from "@/lib/mcp/auth";

/**
 * RFC 9728: `resource` es la URL exacta del MCP y `authorization_servers` apunta al issuer del
 * OAuth Server de Supabase (PLAN.md §7).
 */
export function GET(request: Request) {
  return Response.json(
    {
      resource: mcpResourceUrl(request),
      authorization_servers: [authServerUrl()],
      bearer_methods_supported: ["header"],
      resource_name: "Relevo",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=3600",
      },
    },
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
