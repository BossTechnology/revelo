import { Bot, GitBranch, GitCommit, GitPullRequest, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { TurnChip, TypeChip } from "@/components/relevo/chips";
import { ClosePanelOnEscape } from "@/components/relevo/task/close-on-escape";
import {
  AttachmentUpload,
  BodyEditor,
  CopyButton,
  DownloadButton,
  DueDateField,
  ReplyForm,
  ReplyMark,
  StatusSelect,
  TitleField,
  TurnSelect,
} from "@/components/relevo/task/task-controls";
import { relativeAge, turnInfo } from "@/lib/relevo/domain";
import { getBoard, getTaskDetail, getViewer } from "@/lib/relevo/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/p/[key]/t/[taskKey]">): Promise<Metadata> {
  const { taskKey } = await params;
  return { title: `${taskKey.toUpperCase()} · Relevo` };
}

const EVENT_TEXT: Record<
  string,
  (from: string | null, to: string | null) => string
> = {
  creada: (_, to) => `creó la tarea ${to ?? ""}`,
  estado: (from, to) => `movió de ${statusName(from)} a ${statusName(to)}`,
  turno: (from, to) => `pasó el turno de ${from ?? "nadie"} a ${to ?? "nadie"}`,
  respuesta: () => "respondió",
  marca: (_, to) =>
    `marcó una respuesta como ${to === "firmada" ? "decisión firmada" : to === "oficial" ? "respuesta oficial" : "normal"}`,
  adjunto: (_, to) => `adjuntó ${to ?? "un archivo"}`,
  git_vinculado: (_, to) => `vinculó actividad de Git ${to ?? ""}`,
};

function statusName(s: string | null) {
  return s === "por_hacer"
    ? "Por hacer"
    : s === "en_proceso"
      ? "En proceso"
      : s === "terminado"
        ? "Terminado"
        : "—";
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const VIA_LABEL: Record<string, string> = {
  web: "web",
  mcp: "IA (MCP)",
  github: "GitHub",
  sistema: "sistema",
};

export default async function TaskPanel({
  params,
}: PageProps<"/p/[key]/t/[taskKey]">) {
  const { key, taskKey } = await params;
  const projectKey = key.toUpperCase();
  const [viewer, detail, board] = await Promise.all([
    getViewer(),
    getTaskDetail(projectKey, taskKey.toUpperCase()),
    getBoard(projectKey),
  ]);
  if (!viewer || !detail || !board) notFound();

  const { task, replies, attachments, events, git } = detail;
  const ctx = { taskId: task.id, projectKey };
  const name = (id: string | null) =>
    id ? (viewer.profiles.get(id)?.display_name ?? "Alguien") : "Sistema";
  const members = board.project.memberIds
    .map((id) => viewer.profiles.get(id))
    .filter((p) => p !== undefined)
    .map((p) => ({ id: p.id, name: p.display_name }));
  const turn = turnInfo(task, viewer.profiles);
  const currentTurn =
    task.turn === "persona"
      ? `u:${task.turn_user_id}`
      : task.turn === "tercero"
        ? `t:${task.turn_third_party}`
        : "";
  const closeHref = `/p/${projectKey}`;

  return (
    <aside
      aria-label={`Detalle de la tarea ${task.key}`}
      className="fixed inset-y-0 right-0 z-30 flex w-full flex-col overflow-y-auto border-l bg-card shadow-2xl sm:w-[520px]"
    >
      <ClosePanelOnEscape href={closeHref} />
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/95 px-5 py-3 backdrop-blur">
        <span className="font-mono text-sm font-semibold">{task.key}</span>
        {task.aliases.map((a) => (
          <span
            key={a}
            className="font-mono text-xs text-muted-foreground"
            title="ID heredado"
          >
            {a}
          </span>
        ))}
        <TypeChip type={task.type} />
        <CopyButton value={task.key} label={`Copiar ${task.key}`} />
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Cerrar detalle"
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="flex flex-col gap-6 px-5 py-4">
        <div className="flex flex-col gap-3">
          <TitleField ctx={ctx} title={task.title} />
          <TurnChip turn={turn} className="w-fit" />
          <p className="text-xs text-muted-foreground">
            Creada por {name(task.created_by)} vía {VIA_LABEL[task.created_via]}{" "}
            · {relativeAge(task.created_at)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatusSelect ctx={ctx} status={task.status} />
          <TurnSelect
            ctx={ctx}
            current={currentTurn}
            members={members}
            me={viewer.userId}
            closed={task.status === "terminado"}
          />
          <DueDateField ctx={ctx} due={task.due_date} />
        </div>

        <Section title="Instrucciones">
          <BodyEditor ctx={ctx} body={task.body} />
        </Section>

        <Section title={`Adjuntos (${attachments.length})`}>
          {attachments.length > 0 && (
            <ul className="flex flex-col gap-2">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {a.filename}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {humanSize(a.size_bytes)}
                    </span>
                    <DownloadButton attachmentId={a.id} filename={a.filename} />
                  </div>
                  {[
                    ["md5", a.md5],
                    ["sha1", a.sha1],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center gap-1 font-mono text-xs text-muted-foreground"
                    >
                      <span className="w-9 shrink-0">{label}</span>
                      {value ? (
                        <>
                          <span className="truncate" data-hash={label}>
                            {value}
                          </span>
                          <CopyButton
                            value={value}
                            label={`Copiar ${label} de ${a.filename}`}
                          />
                        </>
                      ) : (
                        <span>calculando…</span>
                      )}
                    </div>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {name(a.uploaded_by)} vía {VIA_LABEL[a.via]} ·{" "}
                    {relativeAge(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <AttachmentUpload ctx={ctx} />
        </Section>

        <Section title={`Hilo (${replies.length})`}>
          <ol className="flex flex-col gap-3">
            {replies.map((r) => (
              <li
                key={r.id}
                aria-label={`Respuesta de ${name(r.author_id)}`}
                className={cn(
                  "flex flex-col gap-2 rounded-md border px-3 py-2",
                  r.mark === "firmada" &&
                    "border-[#047857] bg-[#047857]/5 dark:border-[#62D6AC]",
                  r.mark === "oficial" && "border-primary bg-primary/5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{name(r.author_id)}</span>
                  {r.via === "mcp" && (
                    <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5">
                      <Bot className="size-3" aria-hidden />
                      vía IA
                    </span>
                  )}
                  {r.mark !== "normal" && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-semibold",
                        r.mark === "firmada"
                          ? "bg-[#047857] text-white dark:bg-[#62D6AC] dark:text-[#0E1014]"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {r.mark === "firmada"
                        ? "Decisión firmada"
                        : "Respuesta oficial"}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {relativeAge(r.created_at)}
                  </span>
                  <span className="ml-auto">
                    <ReplyMark ctx={ctx} replyId={r.id} mark={r.mark} />
                  </span>
                </div>
                <div className="prose-relevo text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {r.body}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ol>
          <ReplyForm ctx={ctx} />
        </Section>

        <Section title="Actividad en Git">
          {git.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada vinculado todavía. Se vincula solo con el ID en la rama, el
              commit o el PR (ej.{" "}
              <code className="font-mono">
                {task.key.toLowerCase()}-descripcion
              </code>
              ).
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {git.map((g) => (
                <li key={g.id} className="flex items-center gap-2">
                  {g.kind === "pull_request" ? (
                    <GitPullRequest className="size-4 shrink-0" aria-hidden />
                  ) : g.kind === "commit" || g.kind === "push" ? (
                    <GitCommit className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <GitBranch className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {g.kind === "pull_request"
                      ? `PR #${g.pr_number} ${g.state === "merged" ? "mergeado" : g.state === "closed" ? "cerrado" : "abierto"}`
                      : g.kind === "check"
                        ? `CI ${g.state === "success" ? "verde" : g.state === "failure" ? "rojo" : (g.state ?? "")}`
                        : (g.title ?? g.sha?.slice(0, 7))}
                    {g.ref && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {g.ref}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relativeAge(g.occurred_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Historial">
          <ol
            className="flex flex-col gap-1.5 text-xs"
            aria-label="Historial de la tarea"
          >
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="text-muted-foreground tabular-nums">
                  {relativeAge(e.created_at)}
                </span>
                <span>
                  <strong className="font-medium">{name(e.actor_id)}</strong>{" "}
                  {(EVENT_TEXT[e.kind] ?? (() => e.kind))(
                    e.from_value,
                    e.to_value,
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    · vía {VIA_LABEL[e.via] ?? e.via}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
