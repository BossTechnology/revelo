import { supabaseWebhookStore } from "@/lib/github/store";
import { handleWebhook } from "@/lib/github/webhook";

/**
 * POST /api/github/webhook — eventos de la GitHub App (push, pull_request, check_suite).
 * Firma inválida: 401. Delivery repetido: no duplica. Responde rápido: solo guarda y vincula.
 */
export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret)
    return Response.json({ error: "Webhook sin configurar." }, { status: 503 });

  const rawBody = await request.text();
  const result = await handleWebhook({
    secret,
    store: supabaseWebhookStore(),
    rawBody,
    headers: {
      signature: request.headers.get("x-hub-signature-256"),
      event: request.headers.get("x-github-event"),
      delivery: request.headers.get("x-github-delivery"),
    },
  });
  if (result.status >= 400)
    console.warn("[github-webhook]", result.status, result.body);
  return Response.json(result.body, { status: result.status });
}
