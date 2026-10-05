"use client";

import { BookMarked, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProjectMember,
  connectRepo,
  disconnectRepo,
  updateProjectSettings,
} from "@/lib/relevo/actions";

type Ctx = { projectId: string; projectKey: string };
type Result = { ok: true } | { ok: false; error: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(ok);
        after?.();
      }
    });
  return [pending, run] as const;
}

export function GeneralForm({
  ctx,
  name,
  color,
}: {
  ctx: Ctx;
  name: string;
  color: string;
}) {
  const [pending, run] = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(
          () =>
            updateProjectSettings({
              ...ctx,
              name: String(f.get("name")),
              color: String(f.get("color")),
            }),
          "Proyecto actualizado",
        );
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor="settings-name">Nombre</Label>
        <Input id="settings-name" name="name" defaultValue={name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-color">Color</Label>
        <Input
          id="settings-color"
          name="color"
          type="color"
          defaultValue={color}
          className="h-9 w-16 p-1"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Prefijo</span>
        <span
          className="flex h-9 items-center font-mono text-sm text-muted-foreground"
          title="El prefijo no cambia: formaría IDs nuevos"
        >
          {ctx.projectKey}
        </span>
      </div>
      <Button type="submit" disabled={pending}>
        Guardar
      </Button>
    </form>
  );
}

export function AddMember({
  ctx,
  candidates,
}: {
  ctx: Ctx;
  candidates: { id: string; name: string }[];
}) {
  const [pending, run] = useRun();
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todas las personas invitadas ya son miembros.
      </p>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const userId = String(new FormData(e.currentTarget).get("user"));
        run(() => addProjectMember({ ...ctx, userId }), "Miembro agregado");
      }}
    >
      <label htmlFor="add-member" className="sr-only">
        Persona
      </label>
      <select
        id="add-member"
        name="user"
        className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" disabled={pending}>
        Agregar
      </Button>
    </form>
  );
}

export function ConnectRepo({
  ctx,
  installationId,
}: {
  ctx: Ctx;
  installationId: string | null;
}) {
  const [pending, run] = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        run(
          () =>
            connectRepo({
              ...ctx,
              fullName: String(f.get("repo")),
              installationId: Number(f.get("installation")),
            }),
          "Repo conectado",
          () => form.reset(),
        );
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="repo-name">Repo (organización/repo o URL)</Label>
        <Input
          id="repo-name"
          name="repo"
          placeholder="BossTechnology/BOb-engine"
          required
          className="font-mono"
        />
      </div>
      <div className="flex w-44 flex-col gap-1.5">
        <Label htmlFor="repo-installation">Instalación de la app</Label>
        <Input
          id="repo-installation"
          name="installation"
          inputMode="numeric"
          defaultValue={installationId ?? ""}
          placeholder="61234567"
          required
          className="font-mono"
        />
      </div>
      <Button type="submit" disabled={pending}>
        Conectar
      </Button>
    </form>
  );
}

export function RepoRow({
  ctx,
  owner,
  repo,
}: {
  ctx: Ctx;
  owner: string;
  repo: string;
}) {
  const [pending, run] = useRun();
  return (
    <li className="flex items-center gap-2 px-4 py-2.5">
      <BookMarked className="size-4 text-muted-foreground" aria-hidden />
      <span className="flex-1 font-mono text-sm">
        {owner}/{repo}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Desconectar ${owner}/${repo}`}
        disabled={pending}
        onClick={() =>
          run(
            () => disconnectRepo({ ...ctx, owner, repo }),
            "Repo desconectado",
          )
        }
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
