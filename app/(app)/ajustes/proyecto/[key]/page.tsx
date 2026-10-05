import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AddMember,
  ConnectRepo,
  GeneralForm,
  RepoRow,
} from "@/components/relevo/project-settings";
import { getViewer } from "@/lib/relevo/queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/ajustes/proyecto/[key]">): Promise<Metadata> {
  const { key } = await params;
  return { title: `Ajustes de ${key.toUpperCase()} · Relevo` };
}

/**
 * Ajustes del proyecto (PLAN.md §8): miembros, repos conectados de cualquier organización
 * (instalando la GitHub App), nombre y color. GitHub vuelve aquí con ?installation_id= después
 * de instalar la app.
 */
export default async function ProjectSettingsPage({
  params,
  searchParams,
}: PageProps<"/ajustes/proyecto/[key]">) {
  const { key } = await params;
  const { installation_id } = await searchParams;
  const viewer = await getViewer();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, key, color, project_members(user_id), project_repos(owner, repo, installation_id)",
    )
    .eq("key", key.toUpperCase())
    .maybeSingle();
  if (!project || !viewer) notFound();

  const ctx = { projectId: project.id, projectKey: project.key };
  const memberIds = new Set(project.project_members.map((m) => m.user_id));
  const people = [...viewer.profiles.values()];
  const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  const installationId =
    typeof installation_id === "string"
      ? installation_id
      : (project.project_repos[0]?.installation_id?.toString() ?? null);

  return (
    <main className="flex max-w-3xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <nav aria-label="Ruta" className="text-sm text-muted-foreground">
          <Link href={`/p/${project.key}`} className="hover:underline">
            {project.name}
          </Link>{" "}
          / Ajustes
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ajustes de {project.name}
        </h1>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="general">
        <h2 id="general" className="text-sm font-semibold">
          General
        </h2>
        <GeneralForm ctx={ctx} name={project.name} color={project.color} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="miembros">
        <h2 id="miembros" className="text-sm font-semibold">
          Miembros
        </h2>
        <ul className="flex flex-wrap gap-2">
          {people
            .filter((p) => memberIds.has(p.id))
            .map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm"
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: p.turn_color }}
                />
                {p.display_name}
              </li>
            ))}
        </ul>
        <AddMember
          ctx={ctx}
          candidates={people
            .filter((p) => !memberIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.display_name }))}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="repos">
        <h2 id="repos" className="text-sm font-semibold">
          Repos de GitHub
        </h2>
        <p className="text-sm text-muted-foreground">
          Los commits, PRs y CI se vinculan solos a la tarea por el ID en la
          rama (ej.{" "}
          <code className="font-mono">
            {project.key.toLowerCase()}-14-descripcion
          </code>
          ), en el commit o en el PR. Solo cuentan los IDs con el prefijo{" "}
          {project.key}.
        </p>
        {appSlug ? (
          <a
            href={`https://github.com/apps/${appSlug}/installations/new?state=${project.key}`}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline"
          >
            Instalar la GitHub App en una organización
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            La GitHub App todavía no está configurada en este entorno.
          </p>
        )}
        {project.project_repos.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {project.project_repos.map((r) => (
              <RepoRow
                key={`${r.owner}/${r.repo}`}
                ctx={ctx}
                owner={r.owner}
                repo={r.repo}
              />
            ))}
          </ul>
        )}
        <ConnectRepo ctx={ctx} installationId={installationId} />
      </section>
    </main>
  );
}
