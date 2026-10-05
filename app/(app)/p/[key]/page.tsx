import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: PageProps<"/p/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: `${key.toUpperCase()} · Relevo` };
}

/** El board lo pinta el layout; esta página es el estado "sin tarea abierta". */
export default function BoardPage() {
  return null;
}
