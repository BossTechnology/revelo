"use client";

import {
  Archive,
  ArchiveRestore,
  BookMarked,
  LogOut,
  Tag,
  Trash2,
  UserMinus,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProjectMember,
  changeMemberAccess,
  connectRepo,
  createCategory,
  disconnectRepo,
  leaveProject,
  removeProjectMember,
  updateCategory,
  updateProjectSettings,
} from "@/lib/relevo/actions";
import { ACCESS_LABEL, type Access } from "@/lib/relevo/domain";

type Ctx = { projectId: string; projectKey: string };
type Result = { ok: true } | { ok: false; error: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (
    fn: () => Promise<Result>,
    ok: string,
    after?: () => void,
    failed?: () => void,
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        failed?.();
      } else {
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

const ACCESSES = Object.keys(ACCESS_LABEL) as Access[];
const SMALL_SELECT =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-60 dark:bg-input/30";

/**
 * Miembros con su acceso (Fase 8). Un editor cambia el acceso y quita a otros; un lector solo
 * ve la lista. Las reglas (último editor, turnos abiertos) las cuida la base y su mensaje llega
 * tal cual.
 */
export function MemberList({
  ctx,
  members,
  me,
  canEdit,
}: {
  ctx: Ctx;
  members: { id: string; name: string; color: string; acceso: Access }[];
  me: string;
  canEdit: boolean;
}) {
  return (
    <ul
      aria-label="Miembros del proyecto"
      className="flex flex-col divide-y rounded-lg border bg-card"
    >
      {members.map((m) => (
        // La clave incluye el acceso: si cambia en el servidor, la fila arranca con el valor nuevo.
        <MemberRow
          key={`${m.id}-${m.acceso}`}
          ctx={ctx}
          member={m}
          me={me}
          canEdit={canEdit}
        />
      ))}
    </ul>
  );
}

function MemberRow({
  ctx,
  member,
  me,
  canEdit,
}: {
  ctx: Ctx;
  member: { id: string; name: string; color: string; acceso: Access };
  me: string;
  canEdit: boolean;
}) {
  const [pending, run] = useRun();
  // Controlado: si la base rechaza el cambio (último editor, turnos abiertos), vuelve al real.
  const [acceso, setAcceso] = useState(member.acceso);
  return (
    <li
      aria-label={member.name}
      className="flex items-center gap-2 px-3 py-2 text-sm"
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: member.color }}
      />
      <span className="flex-1">
        {member.name}
        {member.id === me ? " (tú)" : ""}
      </span>
      {canEdit ? (
        <select
          aria-label={`Acceso de ${member.name}`}
          className={SMALL_SELECT}
          value={acceso}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as Access;
            setAcceso(next);
            run(
              () =>
                changeMemberAccess({ ...ctx, userId: member.id, acceso: next }),
              "Acceso actualizado",
              undefined,
              () => setAcceso(member.acceso),
            );
          }}
        >
          {ACCESSES.map((a) => (
            <option key={a} value={a}>
              {ACCESS_LABEL[a]}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-muted-foreground">
          {ACCESS_LABEL[member.acceso]}
        </span>
      )}
      {canEdit && member.id !== me && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Quitar a ${member.name}`}
          title="Quitar del proyecto"
          disabled={pending}
          onClick={() =>
            run(
              () => removeProjectMember({ ...ctx, userId: member.id }),
              `${member.name} ya no es miembro`,
            )
          }
        >
          <UserMinus className="size-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** Cualquiera puede salirse; la base lo impide si es el último editor. */
export function LeaveProject({ ctx }: { ctx: Ctx }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-fit"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `¿Salir de ${ctx.projectKey}? Dejarás de verlo hasta que un editor te vuelva a sumar.`,
          )
        )
          return;
        start(async () => {
          // Si sale bien, la acción redirige a /.
          const r = await leaveProject(ctx);
          if (!r.ok) toast.error(r.error);
        });
      }}
    >
      <LogOut className="size-4" aria-hidden />
      Salir del proyecto
    </Button>
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
        const f = new FormData(e.currentTarget);
        run(
          () =>
            addProjectMember({
              ...ctx,
              userId: String(f.get("user")),
              acceso: String(f.get("acceso")) as Access,
            }),
          "Miembro agregado",
        );
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
      <label htmlFor="add-member-access" className="sr-only">
        Acceso
      </label>
      <select
        id="add-member-access"
        name="acceso"
        defaultValue="lector"
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
      >
        {ACCESSES.map((a) => (
          <option key={a} value={a}>
            {ACCESS_LABEL[a]}
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

/** Categorías (Fase 7): se agregan, renombran y archivan; no se borran. */
export function CategoryList({
  ctx,
  categories,
}: {
  ctx: Ctx;
  categories: { id: string; name: string; archived: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {categories.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {categories.map((c) => (
            <CategoryRow key={c.id} ctx={ctx} category={c} />
          ))}
        </ul>
      )}
      <NewCategory ctx={ctx} />
    </div>
  );
}

function CategoryRow({
  ctx,
  category,
}: {
  ctx: Ctx;
  category: { id: string; name: string; archived: boolean };
}) {
  const [pending, run] = useRun();
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "");
          if (name.trim() === category.name) return;
          run(
            () => updateCategory({ ...ctx, categoryId: category.id, name }),
            "Categoría renombrada",
          );
        }}
      >
        <Input
          name="name"
          aria-label={`Nombre de la categoría ${category.name}`}
          defaultValue={category.name}
          disabled={pending}
          className={category.archived ? "text-muted-foreground" : undefined}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Guardar
        </Button>
      </form>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`${category.archived ? "Reactivar" : "Archivar"} ${category.name}`}
        title={category.archived ? "Reactivar" : "Archivar"}
        onClick={() =>
          run(
            () =>
              updateCategory({
                ...ctx,
                categoryId: category.id,
                archived: !category.archived,
              }),
            category.archived ? "Categoría reactivada" : "Categoría archivada",
          )
        }
      >
        {category.archived ? (
          <ArchiveRestore className="size-4" aria-hidden />
        ) : (
          <Archive className="size-4" aria-hidden />
        )}
      </Button>
    </li>
  );
}

function NewCategory({ ctx }: { ctx: Ctx }) {
  const [pending, run] = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = String(new FormData(form).get("name") ?? "");
        run(
          () => createCategory({ ...ctx, name }),
          "Categoría creada",
          () => form.reset(),
        );
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="category-name">Nueva categoría</Label>
        <Input
          id="category-name"
          name="name"
          required
          placeholder="TBT Admin"
        />
      </div>
      <Button type="submit" disabled={pending}>
        Agregar
      </Button>
    </form>
  );
}
