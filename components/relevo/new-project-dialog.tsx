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
import { createProject } from "@/lib/relevo/actions";
import { cn } from "@/lib/utils";

const COLORS = [
  "#7C3AED",
  "#0E7490",
  "#B45309",
  "#047857",
  "#BE123C",
  "#3442C4",
];

export function NewProjectDialog({
  people,
  me,
}: {
  people: { id: string; name: string }[];
  me: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const others = people.filter((p) => p.id !== me);

  function onSubmit(form: FormData) {
    setError(null);
    start(async () => {
      const result = await createProject({
        name: String(form.get("name") ?? ""),
        key: String(form.get("key") ?? ""),
        color,
        memberIds: form.getAll("members").map(String),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(`Proyecto ${result.data.key} creado`);
      router.push(`/p/${result.data.key}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          Nuevo proyecto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
          <DialogDescription>
            El prefijo forma los IDs de las tareas (MOM-1, MOM-2…). Los repos de
            GitHub se conectan en la Fase 5.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Nombre</Label>
              <Input
                id="project-name"
                name="name"
                required
                autoFocus
                placeholder="Momentum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-key">Prefijo</Label>
              <Input
                id="project-key"
                name="key"
                required
                pattern="[A-Za-z]{2,5}"
                maxLength={5}
                placeholder="MOM"
                className="font-mono uppercase"
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Color</legend>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-background",
                    color === c && "ring-2 ring-foreground",
                  )}
                />
              ))}
            </div>
          </fieldset>
          {others.length > 0 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">
                Miembros (además de ti)
              </legend>
              {others.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="members"
                    value={p.id}
                    defaultChecked
                    className="size-4 accent-primary"
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
