import type { NextConfig } from "next";

/**
 * Encabezados de seguridad (PLAN.md §12). La CSP se arma con el Supabase del entorno:
 * la app solo habla con su propio origen y con ese proyecto (API, Storage y Realtime por wss).
 */
const isDev = process.env.NODE_ENV !== "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;
const supabaseHttp = supabase?.origin ?? "";
const supabaseWs = supabase
  ? `${supabase.protocol === "https:" ? "wss" : "ws"}://${supabase.host}`
  : "";

const csp = [
  "default-src 'self'",
  // Next inyecta scripts en línea para hidratar; en desarrollo además necesita eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseHttp}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHttp} ${supabaseWs}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  // El consentimiento OAuth del MCP termina redirigiendo a Claude o al loopback de Claude Code.
  `form-action 'self' https://claude.ai http://localhost:* http://127.0.0.1:* ${supabaseHttp}`,
]
  .join("; ")
  .replace(/\s+/g, " ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
