/** Lectura de correos del Mailpit local (API v1). */
const base = () => {
  const url = process.env.MAILPIT_URL;
  if (!url) throw new Error("Falta MAILPIT_URL: corre `pnpm env:local`.");
  return url;
};

type Summary = { ID: string; To: { Address: string }[] };

export async function messagesTo(email: string): Promise<Summary[]> {
  const res = await fetch(
    `${base()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  );
  if (!res.ok) throw new Error(`Mailpit respondió ${res.status}`);
  const body = (await res.json()) as { messages: Summary[] };
  return body.messages;
}

/** ID del último correo recibido por `email` (para esperar uno más nuevo). */
export async function latestMessageId(email: string): Promise<string | null> {
  const [latest] = await messagesTo(email);
  return latest?.ID ?? null;
}

/**
 * Primer enlace del último correo recibido por `email`, o null si no ha llegado. Con
 * `newerThan`, ignora ese correo: los enlaces sirven una sola vez y no hay que reusar uno viejo.
 */
export async function latestLinkTo(
  email: string,
  newerThan?: string | null,
): Promise<string | null> {
  const [latest] = await messagesTo(email);
  if (!latest || latest.ID === newerThan) return null;
  const res = await fetch(`${base()}/api/v1/message/${latest.ID}`);
  const message = (await res.json()) as { HTML: string };
  const href = message.HTML.match(/href="([^"]+)"/)?.[1];
  return href ? href.replaceAll("&amp;", "&") : null;
}
