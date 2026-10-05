"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTask } from "@/lib/relevo/actions";
import { TASK_TYPES, type TaskType } from "@/lib/relevo/domain";

export type Member = { id: string; name: string };

const NATIVE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30";

export function NewTaskDialog({
  projectId,
  projectKey,
  members,
  me,
}: {
  projectId: string;
  projectKey: string;
  members: Member[];
  me: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [turn, setTurn] = useState(
    `u:${members.find((m) => m.id !== me)?.id ?? me}`,
  );
  const [error, setError] = useState<string | null>(null);

  function onSubmit(form: FormData) {
    setError(null);
    const third = String(form.get("third") ?? "").trim();
    startTransition(async () => {
      const result = await createTask({
        projectId,
        projectKey,
        type: String(form.get("type")),
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
        turn: turn === "t:" ? `t:${third}` : turn,
        dueDate: String(form.get("due") ?? "") || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(`${result.data.key} creada`);
      router.push(`/p/${projectKey}/t/${result.data.key}`, { scroll: false });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Nueva tarea
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva tarea en {projectKey}</DialogTitle>
          <DialogDescription>
            El ID se asigna solo al crearla.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-type">Tipo</Label>
              <select
                id="new-type"
                name="type"
                defaultValue="handoff"
                className={NATIVE_SELECT}
              >
                {(Object.keys(TASK_TYPES) as TaskType[]).map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPES[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-turn">Turno</Label>
              <select
                id="new-turn"
                value={turn}
                onChange={(e) => setTurn(e.target.value)}
                className={NATIVE_SELECT}
              >
                {members.map((m) => (
                  <option key={m.id} value={`u:${m.id}`}>
                    {m.name}
                    {m.id === me ? " (yo)" : ""}
                  </option>
                ))}
                <option value="t:">Un tercero…</option>
              </select>
            </div>
          </div>
          {turn === "t:" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-third">¿Qué tercero?</Label>
              <Input
                id="new-third"
                name="third"
                placeholder="platform team, repo admin…"
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-title">Título</Label>
            <Input id="new-title" name="title" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-body">Instrucciones</Label>
            <Textarea
              id="new-body"
              name="body"
              rows={6}
              placeholder={
                "Markdown. El report-back puede ir como checklist:\n- [ ] Tests en verde"
              }
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-1/2">
            <Label htmlFor="new-due">Fecha límite (opcional)</Label>
            <Input id="new-due" name="due" type="date" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear tarea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
