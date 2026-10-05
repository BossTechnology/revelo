"use client";

import { Check, Copy, Download, Pencil, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addReply,
  attachmentDownloadUrl,
  createUploadUrl,
  markReply,
  moveTask,
  passTurn,
  updateTask,
} from "@/lib/relevo/actions";
import { COLUMNS, type TaskStatus } from "@/lib/relevo/domain";
import { toggleChecklistItem } from "@/lib/relevo/markdown";
import { createClient } from "@/lib/supabase/client";

const NATIVE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60 dark:bg-input/30";

type Ctx = { taskId: string; projectKey: string };

/** Corre una acción y avisa si falla. */
function useAction() {
  const [pending, start] = useTransition();
  const run = (
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    ok?: string,
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (ok) toast.success(ok);
    });
  return [pending, run] as const;
}

export function StatusSelect({
  ctx,
  status,
}: {
  ctx: Ctx;
  status: TaskStatus;
}) {
  const [pending, run] = useAction();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="task-status">Estado</Label>
      <select
        id="task-status"
        className={NATIVE_SELECT}
        defaultValue={status}
        key={status}
        disabled={pending}
        onChange={(e) =>
          run(() => moveTask({ ...ctx, status: e.target.value }))
        }
      >
        {COLUMNS.map((c) => (
          <option key={c.status} value={c.status}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TurnSelect({
  ctx,
  current,
  members,
  me,
  closed,
}: {
  ctx: Ctx;
  current: string;
  members: { id: string; name: string }[];
  me: string;
  closed: boolean;
}) {
  const [pending, run] = useAction();
  const [third, setThird] = useState(
    current.startsWith("t:") ? current.slice(2) : "",
  );
  const [value, setValue] = useState(current.startsWith("t:") ? "t:" : current);

  if (closed) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Turno</span>
        <p className="h-9 content-center text-sm text-muted-foreground">
          Nadie: la tarea está terminada.
        </p>
      </div>
    );
  }
  const submit = (target: string) =>
    run(() => passTurn({ ...ctx, target }), "Turno actualizado");

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="task-turn">Turno</Label>
      <select
        id="task-turn"
        className={NATIVE_SELECT}
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value !== "t:") submit(e.target.value);
        }}
      >
        {members.map((m) => (
          <option key={m.id} value={`u:${m.id}`}>
            {m.name}
            {m.id === me ? " (yo)" : ""}
          </option>
        ))}
        <option value="t:">Un tercero…</option>
      </select>
      {value === "t:" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(`t:${third}`);
          }}
        >
          <Input
            aria-label="Nombre del tercero"
            value={third}
            onChange={(e) => setThird(e.target.value)}
            placeholder="platform team"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !third.trim()}
          >
            Pasar
          </Button>
        </form>
      )}
    </div>
  );
}

export function DueDateField({ ctx, due }: { ctx: Ctx; due: string | null }) {
  const [pending, run] = useAction();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="task-due">Fecha límite</Label>
      <Input
        id="task-due"
        type="date"
        defaultValue={due ?? ""}
        key={due ?? "none"}
        disabled={pending}
        onChange={(e) =>
          run(() => updateTask({ ...ctx, dueDate: e.target.value || null }))
        }
      />
    </div>
  );
}

export function TitleField({ ctx, title }: { ctx: Ctx; title: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, run] = useAction();
  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        <h2 className="text-lg leading-snug font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Editar título"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("title") as string;
        run(async () => {
          const r = await updateTask({ ...ctx, title: value });
          if (r.ok) setEditing(false);
          return r;
        });
      }}
    >
      <Input name="title" aria-label="Título" defaultValue={title} autoFocus />
      <Button type="submit" size="sm" disabled={pending}>
        Guardar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setEditing(false)}
      >
        Cancelar
      </Button>
    </form>
  );
}

export function BodyEditor({ ctx, body }: { ctx: Ctx; body: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, run] = useAction();
  let checkbox = -1;

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("body") as string;
          run(async () => {
            const r = await updateTask({ ...ctx, body: value });
            if (r.ok) setEditing(false);
            return r;
          });
        }}
      >
        <Textarea
          name="body"
          aria-label="Instrucciones"
          defaultValue={body}
          rows={12}
          className="font-mono text-xs"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Guardar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {body.trim() ? (
        <div className="prose-relevo text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              input: ({ checked, type }) => {
                if (type !== "checkbox") return null;
                const index = ++checkbox;
                return (
                  <input
                    type="checkbox"
                    checked={!!checked}
                    disabled={pending}
                    aria-label="Marcar punto del report-back"
                    className="mr-2 size-4 translate-y-0.5 accent-primary"
                    onChange={() =>
                      run(() =>
                        updateTask({
                          ...ctx,
                          body: toggleChecklistItem(body, index),
                        }),
                      )
                    }
                  />
                );
              },
            }}
          >
            {body}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin instrucciones.</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" aria-hidden />
        Editar instrucciones
      </Button>
    </div>
  );
}

export function ReplyForm({ ctx }: { ctx: Ctx }) {
  const [pending, run] = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = new FormData(e.currentTarget).get("reply") as string;
        run(async () => {
          const r = await addReply({ ...ctx, body });
          if (r.ok) formRef.current?.reset();
          return r;
        });
      }}
    >
      <Label htmlFor="reply" className="sr-only">
        Responder
      </Label>
      <Textarea
        id="reply"
        name="reply"
        rows={3}
        placeholder="Responder (markdown)…"
        required
      />
      <Button type="submit" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Enviando…" : "Responder"}
      </Button>
    </form>
  );
}

export function ReplyMark({
  ctx,
  replyId,
  mark,
}: {
  ctx: Ctx;
  replyId: string;
  mark: "normal" | "oficial" | "firmada";
}) {
  const [pending, run] = useAction();
  return (
    <select
      aria-label="Marca de la respuesta"
      className="h-7 rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30"
      defaultValue={mark}
      key={mark}
      disabled={pending}
      onChange={(e) =>
        run(() =>
          markReply({
            projectKey: ctx.projectKey,
            replyId,
            mark: e.target.value as "normal" | "oficial" | "firmada",
          }),
        )
      }
    >
      <option value="normal">Normal</option>
      <option value="oficial">Respuesta oficial</option>
      <option value="firmada">Decisión firmada</option>
    </select>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={label}
      title={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}

export function DownloadButton({
  attachmentId,
  filename,
}: {
  attachmentId: string;
  filename: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={`Descargar ${filename}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await attachmentDownloadUrl(attachmentId);
          if (r.ok) window.location.assign(r.data.url);
          else toast.error(r.error);
        })
      }
    >
      <Download className="size-3.5" aria-hidden />
    </Button>
  );
}

/**
 * Subida en dos pasos: el navegador sube directo a Storage con una URL firmada y después
 * /api/attachments/finalize calcula md5 y sha1 en el servidor (los que valen).
 */
export function AttachmentUpload({ ctx }: { ctx: Ctx }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    start(async () => {
      const signed = await createUploadUrl({
        taskId: ctx.taskId,
        filename: file.name,
        size: file.size,
      });
      if (!signed.ok) {
        toast.error(signed.error);
        return;
      }
      const { error } = await createClient()
        .storage.from("attachments")
        .uploadToSignedUrl(signed.data.path, signed.data.token, file);
      if (error) {
        toast.error(`No se pudo subir: ${error.message}`);
        return;
      }
      const res = await fetch("/api/attachments/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: ctx.taskId,
          path: signed.data.path,
          filename: file.name,
        }),
      });
      const body = (await res.json()) as { md5?: string; error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo registrar el adjunto.");
        return;
      }
      toast.success(`${file.name} adjuntado · md5 ${body.md5}`);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        id="attachment-input"
        type="file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-fit"
        aria-disabled={pending}
      >
        <label htmlFor="attachment-input" className="cursor-pointer">
          <Upload className="size-3.5" aria-hidden />
          {pending ? "Subiendo…" : "Adjuntar archivo"}
        </label>
      </Button>
    </div>
  );
}
