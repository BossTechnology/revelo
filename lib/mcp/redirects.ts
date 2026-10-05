/**
 * Redirect URIs aceptados para clientes MCP (PLAN.md §7):
 *  - Claude web, desktop y Cowork: https://claude.ai/api/mcp/auth_callback
 *  - Claude Code: loopback con puerto variable, http://localhost:<puerto>/callback o 127.0.0.1.
 * Cualquier otro destino se rechaza en la pantalla de consentimiento.
 */
export function isAllowedMcpRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (
    url.protocol === "https:" &&
    url.host === "claude.ai" &&
    url.pathname === "/api/mcp/auth_callback"
  ) {
    return true;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return (
    url.protocol === "http:" &&
    loopback &&
    url.pathname === "/callback" &&
    !url.username &&
    !url.password
  );
}
