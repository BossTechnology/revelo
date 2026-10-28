-- Fase 8: miembros lectores (docs/adr/0002).
--  * project_members.acceso: 'editor' o 'lector', por proyecto. Por defecto 'lector': quien se
--    equivoca da menos permisos, no más. Los miembros que ya existen quedan como editores.
--  * puede_editar() reemplaza a is_member() en toda política de insert, update y delete. La
--    lectura sigue con is_member(). El guard de supabase/tests/lectores.test.sql lo exige.
--  * Solo un editor gestiona miembros; cualquiera se sale. Un proyecto nunca se queda sin editor
--    y el turno nunca queda en manos de un lector (triggers).
--  * profiles se acota: ves el tuyo y los de quienes comparten proyecto contigo, o todos si eres
--    editor de algún proyecto. companies la renombra solo un editor de la empresa.
--  * create_project exige ser editor y recibe el acceso de cada persona que se suma.

-- ---------------------------------------------------------------------------
-- Acceso
-- ---------------------------------------------------------------------------
create type public.member_access as enum ('editor', 'lector');

alter table public.project_members
  add column acceso public.member_access not null default 'editor';
alter table public.project_members alter column acceso set default 'lector';

-- ¿El usuario de la sesión es editor del proyecto? Toda escritura pasa por aquí.
create function public.puede_editar(project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = project and m.user_id = (select auth.uid()) and m.acceso = 'editor'
  );
$$;
revoke execute on function public.puede_editar(uuid) from public, anon;
grant execute on function public.puede_editar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Escrituras: is_member() → puede_editar()
-- ---------------------------------------------------------------------------
drop policy "tasks: miembros crean" on public.tasks;
drop policy "tasks: miembros editan" on public.tasks;
create policy "tasks: editores crean" on public.tasks
  for insert to authenticated with check (public.puede_editar(project_id));
create policy "tasks: editores editan" on public.tasks
  for update to authenticated
  using (public.puede_editar(project_id)) with check (public.puede_editar(project_id));

drop policy "replies: miembros responden" on public.replies;
drop policy "replies: miembros marcan" on public.replies;
create policy "replies: editores responden" on public.replies
  for insert to authenticated with check (public.puede_editar(public.task_project(task_id)));
create policy "replies: editores marcan" on public.replies
  for update to authenticated
  using (public.puede_editar(public.task_project(task_id)))
  with check (public.puede_editar(public.task_project(task_id)));

drop policy "attachments: miembros suben" on public.attachments;
create policy "attachments: editores suben" on public.attachments
  for insert to authenticated with check (public.puede_editar(public.task_project(task_id)));

drop policy "attachments bucket: miembros suben" on storage.objects;
create policy "attachments bucket: editores suben" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.puede_editar(public.storage_project(name)));

drop policy "categories: miembros crean" on public.categories;
drop policy "categories: miembros editan" on public.categories;
create policy "categories: editores crean" on public.categories
  for insert to authenticated with check (public.puede_editar(project_id));
create policy "categories: editores editan" on public.categories
  for update to authenticated
  using (public.puede_editar(project_id)) with check (public.puede_editar(project_id));

drop policy "project_repos: miembros conectan" on public.project_repos;
drop policy "project_repos: miembros desconectan" on public.project_repos;
create policy "project_repos: editores conectan" on public.project_repos
  for insert to authenticated with check (public.puede_editar(project_id));
create policy "project_repos: editores desconectan" on public.project_repos
  for delete to authenticated using (public.puede_editar(project_id));

drop policy "projects: miembros editan" on public.projects;
create policy "projects: editores editan" on public.projects
  for update to authenticated using (public.puede_editar(id)) with check (public.puede_editar(id));

-- Una empresa la renombra un editor de alguno de sus proyectos. La subconsulta corre con el RLS
-- de quien llama: solo ve los proyectos de los que es miembro.
drop policy "companies: miembros renombran" on public.companies;
create policy "companies: editores renombran" on public.companies
  for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.company_id = companies.id and public.puede_editar(p.id)))
  with check (exists (select 1 from public.projects p
                      where p.company_id = companies.id and public.puede_editar(p.id)));

-- ---------------------------------------------------------------------------
-- Miembros: un editor suma, cambia el acceso y quita; cualquiera se sale.
-- Del miembro solo cambia el acceso (privilegio de columna).
-- ---------------------------------------------------------------------------
drop policy "project_members: miembros suman personas" on public.project_members;
create policy "project_members: editores suman personas" on public.project_members
  for insert to authenticated with check (public.puede_editar(project_id));
create policy "project_members: editores cambian el acceso" on public.project_members
  for update to authenticated
  using (public.puede_editar(project_id)) with check (public.puede_editar(project_id));
create policy "project_members: editores quitan, cada quien se sale" on public.project_members
  for delete to authenticated
  using (public.puede_editar(project_id) or user_id = (select auth.uid()));
grant update (acceso), delete on public.project_members to authenticated;

-- Reglas que una política no puede expresar porque miran a los demás miembros y las tareas:
--  * un proyecto nunca se queda sin editor;
--  * no se baja a lector ni se quita a alguien con tareas abiertas en su turno (las lista).
-- El `for update` sobre el proyecto serializa dos cambios simultáneos del mismo proyecto.
create function public.guard_project_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_key text;
  member_name text;
  open_tasks text;
begin
  select p.key into project_key from public.projects p where p.id = old.project_id for update;
  -- Se está borrando el proyecto o la persona (cascada): no queda nada que cuidar.
  if project_key is null or not exists (select 1 from public.profiles pr where pr.id = old.user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.user_id := old.user_id;
    if new.acceso = old.acceso or new.acceso = 'editor' then
      return new;
    end if;
  end if;

  -- Desde aquí, old deja de ser editor o deja de ser miembro.
  if old.acceso = 'editor' and not exists (
    select 1 from public.project_members m
    where m.project_id = old.project_id and m.user_id <> old.user_id and m.acceso = 'editor'
  ) then
    raise exception '% se quedaría sin editor. Primero dale acceso de editor a otra persona.', project_key;
  end if;

  select string_agg(t.key, ', ' order by t.number) into open_tasks
  from public.tasks t
  where t.project_id = old.project_id and t.turn = 'persona' and t.turn_user_id = old.user_id
    and t.status <> 'terminado';
  if open_tasks is not null then
    select pr.display_name into member_name from public.profiles pr where pr.id = old.user_id;
    raise exception '% tiene tareas abiertas en su turno en %: %. Pásale el turno a otra persona antes.',
      member_name, project_key, open_tasks;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.guard_project_member() from public, anon, authenticated;

create trigger project_members_guard before update or delete on public.project_members
  for each row execute function public.guard_project_member();

-- ---------------------------------------------------------------------------
-- Turno: solo un editor puede tenerlo
-- ---------------------------------------------------------------------------
-- En un update el proyecto es el de old: guard_task_update() descarta cualquier cambio de
-- project_id, y este trigger corre antes que ese.
-- El WITH CHECK de RLS se evalúa después de los triggers BEFORE: si quien escribe no es editor,
-- el trigger no mira nada y deja que RLS lo rechace (si no, revelaría el nombre y el acceso de
-- un miembro de un proyecto ajeno). 'sistema' (seed, scripts con la secret key) sí se valida.
create function public.guard_task_turn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project uuid := case when tg_op = 'INSERT' then new.project_id else old.project_id end;
  lector_name text;
begin
  if public.request_via() <> 'sistema' and not public.puede_editar(project) then
    return new;
  end if;
  if new.turn = 'persona'
     and (tg_op = 'INSERT' or new.turn_user_id is distinct from old.turn_user_id) then
    select pr.display_name into lector_name
    from public.project_members m
    join public.profiles pr on pr.id = m.user_id
    where m.project_id = project
      and m.user_id = new.turn_user_id
      and m.acceso = 'lector';
    if found then
      raise exception '% tiene acceso de solo lectura en este proyecto: no puede tener el turno.', lector_name;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_task_turn() from public, anon, authenticated;

create trigger tasks_guard_turn before insert or update on public.tasks
  for each row execute function public.guard_task_turn();

-- ---------------------------------------------------------------------------
-- Perfiles: el tuyo, los de quienes comparten proyecto contigo, o todos si eres editor de
-- alguno (hace falta para encontrar a un recién invitado en "Agregar miembro").
-- project_members corre con el RLS de quien llama: solo ve los miembros de sus proyectos.
-- ---------------------------------------------------------------------------
drop policy "profiles: lectura con sesión" on public.profiles;
create policy "profiles: los tuyos, o todos si eres editor" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
    or exists (
      select 1 from public.project_members mine
      where mine.user_id = (select auth.uid()) and mine.acceso = 'editor'
    )
  );

-- ---------------------------------------------------------------------------
-- create_project: exige ser editor (de la empresa si existe, de algún proyecto si es nueva).
-- Quien crea queda como editor; cada persona sumada con el acceso elegido.
-- ---------------------------------------------------------------------------
drop function public.create_project(text, text, text, text, uuid[]);

create function public.create_project(
  project_name text,
  project_key text,
  project_color text,
  company_name text,
  editor_ids uuid[] default '{}',
  lector_ids uuid[] default '{}'
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target_company uuid;
  created public.projects;
begin
  if me is null then
    raise exception 'Hace falta una sesión' using errcode = '42501';
  end if;
  if btrim(coalesce(project_name, '')) = '' then
    raise exception 'El proyecto necesita un nombre' using errcode = '23514';
  end if;
  if btrim(coalesce(company_name, '')) = '' then
    raise exception 'El proyecto necesita una empresa' using errcode = '23514';
  end if;

  select c.id into target_company
  from public.companies c
  where lower(btrim(c.name)) = lower(btrim(company_name));

  if target_company is null then
    if not exists (
      select 1 from public.project_members m where m.user_id = me and m.acceso = 'editor'
    ) then
      raise exception 'Para crear un proyecto tienes que ser editor de alguno' using errcode = '42501';
    end if;
    insert into public.companies (name) values (btrim(company_name))
    returning id into target_company;
  elsif not exists (
    select 1
    from public.projects p
    join public.project_members m on m.project_id = p.id
    where p.company_id = target_company and m.user_id = me and m.acceso = 'editor'
  ) then
    raise exception 'No eres editor en la empresa %', btrim(company_name) using errcode = '42501';
  end if;

  insert into public.projects (name, key, color, company_id)
  values (btrim(project_name), upper(btrim(project_key)), project_color, target_company)
  returning * into created;

  -- Primero quien crea (editor), luego los lectores y al final los editores: si alguien viene
  -- en las dos listas, queda como lector.
  insert into public.project_members (project_id, user_id, acceso)
  values (created.id, me, 'editor');
  insert into public.project_members (project_id, user_id, acceso)
  select created.id, m, 'lector'
  from unnest(coalesce(lector_ids, '{}')) as m
  where exists (select 1 from public.profiles p where p.id = m)
  on conflict do nothing;
  insert into public.project_members (project_id, user_id, acceso)
  select created.id, m, 'editor'
  from unnest(coalesce(editor_ids, '{}')) as m
  where exists (select 1 from public.profiles p where p.id = m)
  on conflict do nothing;

  return created;
end;
$$;

revoke execute on function public.create_project(text, text, text, text, uuid[], uuid[]) from public, anon;
grant execute on function public.create_project(text, text, text, text, uuid[], uuid[]) to authenticated;
