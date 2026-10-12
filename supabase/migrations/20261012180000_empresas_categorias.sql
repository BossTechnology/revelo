-- Fase 7: empresas encima de los proyectos y categorías dentro (docs/adr/0001).
--  * companies: agrupa proyectos. Se crea dentro de create_project; no hay empresas vacías.
--  * categories: subdivisión opcional de un proyecto. No se borran, se archivan.
--  * tasks.category_id: llave foránea compuesta (project_id, category_id), así una tarea no
--    puede quedar con la categoría de otro proyecto.

-- ---------------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);
create unique index companies_name_key on public.companies (lower(btrim(name)));

-- Los proyectos que ya existen son de Boss.
insert into public.companies (name) values ('Boss');

alter table public.projects add column company_id uuid references public.companies;
update public.projects set company_id = (select id from public.companies where name = 'Boss');
alter table public.projects alter column company_id set not null;
create index projects_company_id_idx on public.projects (company_id);

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null check (btrim(name) <> ''),
  position int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, id)
);
create unique index categories_project_name_key
  on public.categories (project_id, lower(btrim(name)));

alter table public.tasks add column category_id uuid;
alter table public.tasks
  add constraint tasks_category_same_project
  foreign key (project_id, category_id) references public.categories (project_id, id);
create index tasks_category_id_idx on public.tasks (category_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.categories enable row level security;

-- Una empresa se ve si eres miembro de al menos uno de sus proyectos.
create function public.is_company_member(company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_members m on m.project_id = p.id
    where p.company_id = company and m.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;

create policy "companies: miembros leen" on public.companies
  for select to authenticated using (public.is_company_member(id));
create policy "companies: miembros renombran" on public.companies
  for update to authenticated
  using (public.is_company_member(id)) with check (public.is_company_member(id));
revoke insert, update, delete on public.companies from anon, authenticated;
grant update (name) on public.companies to authenticated;

-- Categorías: las ven, crean, renombran y archivan los miembros del proyecto. No hay delete.
create policy "categories: miembros leen" on public.categories
  for select to authenticated using (public.is_member(project_id));
create policy "categories: miembros crean" on public.categories
  for insert to authenticated with check (public.is_member(project_id));
create policy "categories: miembros editan" on public.categories
  for update to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));
revoke insert, update, delete on public.categories from anon, authenticated;
grant insert (project_id, name, position) on public.categories to authenticated;
grant update (name, position, archived_at) on public.categories to authenticated;

-- ---------------------------------------------------------------------------
-- create_project ahora recibe la empresa (por nombre). Si no existe, se crea; si existe,
-- quien crea el proyecto tiene que ser miembro de alguno de sus proyectos.
-- ---------------------------------------------------------------------------
drop function public.create_project(text, text, text, uuid[]);

create function public.create_project(
  project_name text,
  project_key text,
  project_color text,
  company_name text,
  member_ids uuid[] default '{}'
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
    insert into public.companies (name) values (btrim(company_name))
    returning id into target_company;
  elsif not exists (
    select 1
    from public.projects p
    join public.project_members m on m.project_id = p.id
    where p.company_id = target_company and m.user_id = me
  ) then
    raise exception 'No eres parte de la empresa %', btrim(company_name) using errcode = '42501';
  end if;

  insert into public.projects (name, key, color, company_id)
  values (btrim(project_name), upper(btrim(project_key)), project_color, target_company)
  returning * into created;

  insert into public.project_members (project_id, user_id)
  select created.id, m
  from unnest(array_append(coalesce(member_ids, '{}'), me)) as m
  where exists (select 1 from public.profiles p where p.id = m)
  on conflict do nothing;

  return created;
end;
$$;

revoke execute on function public.create_project(text, text, text, text, uuid[]) from public, anon;
grant execute on function public.create_project(text, text, text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Historial: cambiar la categoría de una tarea queda registrado.
-- ---------------------------------------------------------------------------
create or replace function public.log_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  via text := public.request_via();
begin
  if tg_table_name = 'tasks' then
    if tg_op = 'INSERT' then
      insert into public.task_events (task_id, actor_id, via, kind, to_value)
      values (new.id, actor, via, 'creada', new.key);
    else
      if new.status is distinct from old.status then
        insert into public.task_events (task_id, actor_id, via, kind, from_value, to_value)
        values (new.id, actor, via, 'estado', old.status::text, new.status::text);
      end if;
      if (new.turn, new.turn_user_id, new.turn_third_party)
         is distinct from (old.turn, old.turn_user_id, old.turn_third_party) then
        insert into public.task_events (task_id, actor_id, via, kind, from_value, to_value)
        values (new.id, actor, via, 'turno', public.turn_label(old), public.turn_label(new));
      end if;
      if new.category_id is distinct from old.category_id then
        insert into public.task_events (task_id, actor_id, via, kind, from_value, to_value)
        values (
          new.id, actor, via, 'categoria',
          (select c.name from public.categories c where c.id = old.category_id),
          (select c.name from public.categories c where c.id = new.category_id)
        );
      end if;
    end if;
  elsif tg_table_name = 'replies' then
    if tg_op = 'INSERT' then
      insert into public.task_events (task_id, actor_id, via, kind, to_value)
      values (new.task_id, actor, via, 'respuesta', new.mark::text);
    elsif new.mark is distinct from old.mark then
      insert into public.task_events (task_id, actor_id, via, kind, from_value, to_value)
      values (new.task_id, actor, via, 'marca', old.mark::text, new.mark::text);
    end if;
  elsif tg_table_name = 'attachments' then
    insert into public.task_events (task_id, actor_id, via, kind, to_value)
    values (new.task_id, actor, via, 'adjunto', new.filename);
  end if;
  return null;
end;
$$;
revoke execute on function public.log_task_event() from public, anon, authenticated;
