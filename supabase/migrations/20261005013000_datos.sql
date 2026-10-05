-- Fase 2: modelo de datos de PLAN.md §5, con RLS, triggers e is_member().
--
-- Principios que se aplican aquí:
--  * Lo hecho por una IA se deriva del token, no se declara: request_via() mira el JWT.
--  * Las IAs proponen, las personas firman: 'firmada' y cerrar un handoff se rechazan si via = mcp.
--  * Sin borrar: tasks, replies y task_events no tienen políticas de delete. Los proyectos se archivan.
--  * El historial (task_events) y la actividad de Git (git_events) son inmutables para los usuarios.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.task_type as enum ('handoff', 'pregunta', 'decision', 'externo');
create type public.task_status as enum ('por_hacer', 'en_proceso', 'terminado');
create type public.turn_kind as enum ('persona', 'tercero', 'nadie');
create type public.reply_mark as enum ('normal', 'oficial', 'firmada');

-- ---------------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key text not null unique check (key ~ '^[A-Z]{2,5}$'),
  color text not null,
  next_number int not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid references public.projects on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (project_id, user_id)
);
create index project_members_user_id_idx on public.project_members (user_id);

create table public.project_repos (
  project_id uuid references public.projects on delete cascade,
  owner text not null,
  repo text not null,
  installation_id bigint not null,
  primary key (owner, repo)
);
create index project_repos_project_id_idx on public.project_repos (project_id);

-- ---------------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects,
  number int not null,
  key text not null unique,
  aliases text[] not null default '{}',
  type public.task_type not null,
  title text not null,
  body text not null default '',
  status public.task_status not null default 'por_hacer',
  turn public.turn_kind not null default 'persona',
  turn_user_id uuid references public.profiles,
  turn_third_party text,
  due_date date,
  created_by uuid not null references public.profiles,
  created_via text not null check (created_via in ('web', 'mcp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number),
  check ((turn = 'persona' and turn_user_id is not null and turn_third_party is null)
      or (turn = 'tercero' and turn_third_party is not null and turn_user_id is null)
      or (turn = 'nadie' and turn_user_id is null and turn_third_party is null)),
  check (status <> 'terminado' or turn = 'nadie')
);
create index tasks_turn_user_id_idx on public.tasks (turn_user_id) where turn = 'persona';
create index tasks_aliases_idx on public.tasks using gin (aliases);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks on delete cascade,
  author_id uuid not null references public.profiles,
  body text not null,
  mark public.reply_mark not null default 'normal',
  via text not null check (via in ('web', 'mcp')),
  created_at timestamptz not null default now()
);
create index replies_task_id_idx on public.replies (task_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks on delete cascade,
  reply_id uuid references public.replies on delete set null,
  storage_path text not null unique,
  filename text not null,
  size_bytes bigint not null check (size_bytes <= 52428800),
  md5 text,
  sha1 text,
  uploaded_by uuid not null references public.profiles,
  via text not null check (via in ('web', 'mcp')),
  created_at timestamptz not null default now()
);
create index attachments_task_id_idx on public.attachments (task_id);

-- Historial (append-only, lo escriben triggers)
create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks on delete cascade,
  actor_id uuid references public.profiles,
  via text not null check (via in ('web', 'mcp', 'github', 'sistema')),
  kind text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);
create index task_events_task_id_idx on public.task_events (task_id, created_at);

-- GitHub (los escribe el webhook con la secret key; Fase 5)
create table public.git_events (
  id bigint generated always as identity primary key,
  delivery_id text not null unique,
  project_id uuid references public.projects,
  owner text not null,
  repo text not null,
  kind text not null check (kind in ('push', 'commit', 'pull_request', 'check')),
  ref text,
  sha text,
  pr_number int,
  title text,
  state text,
  url text,
  payload jsonb not null,
  occurred_at timestamptz not null
);
create index git_events_project_id_idx on public.git_events (project_id, occurred_at desc);

create table public.task_git_links (
  task_id uuid references public.tasks on delete cascade,
  git_event_id bigint references public.git_events on delete cascade,
  matched_in text not null check (matched_in in ('branch', 'commit', 'pr_title', 'pr_body')),
  primary key (task_id, git_event_id)
);
create index task_git_links_git_event_id_idx on public.task_git_links (git_event_id);

-- ---------------------------------------------------------------------------
-- Funciones de apoyo
-- ---------------------------------------------------------------------------

-- ¿El usuario de la sesión es miembro del proyecto? Todas las políticas pasan por aquí.
create function public.is_member(project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = project and m.user_id = (select auth.uid())
  );
$$;

create function public.task_project(task uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.project_id from public.tasks t where t.id = task;
$$;

-- Vía de la petición, derivada del token. Un token del OAuth Server de Supabase (el MCP) trae
-- el claim `client_id`. TODO Fase 4: confirmar el nombre exacto del claim en el spike.
create function public.request_via()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when (select auth.jwt()) ->> 'client_id' is not null then 'mcp'
    when (select auth.uid()) is not null then 'web'
    else 'sistema'
  end;
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.task_project(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.task_project(uuid) to authenticated;
grant execute on function public.request_via() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Triggers de tareas
-- ---------------------------------------------------------------------------

-- Número y clave (BOB-14). El `for update` serializa dos inserts simultáneos del mismo proyecto.
create function public.assign_task_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_key text;
  n int;
begin
  select p.key, p.next_number into project_key, n
  from public.projects p
  where p.id = new.project_id
  for update;

  if project_key is null then
    raise exception 'Proyecto % no existe', new.project_id using errcode = '23503';
  end if;

  new.number := n;
  new.key := project_key || '-' || n;
  update public.projects set next_number = n + 1 where id = new.project_id;
  return new;
end;
$$;

-- Quién y por dónde: no se confía en lo que manda el cliente.
create function public.stamp_task_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  via text := public.request_via();
begin
  -- 'sistema' (seed, migración del Doc, scripts con la secret key) conserva sus valores.
  if via <> 'sistema' then
    new.created_by := (select auth.uid());
    new.created_via := via;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create function public.guard_task_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.request_via() = 'mcp' and new.type = 'handoff'
     and new.status = 'terminado' and old.status <> 'terminado' then
    raise exception 'Solo una persona desde la web puede cerrar un handoff'
      using errcode = '42501';
  end if;
  -- Lo que define la tarea no cambia después de creada.
  new.id := old.id;
  new.project_id := old.project_id;
  new.number := old.number;
  new.key := old.key;
  new.created_by := old.created_by;
  new.created_via := old.created_via;
  new.created_at := old.created_at;
  if public.request_via() <> 'sistema' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger tasks_assign_number before insert on public.tasks
  for each row execute function public.assign_task_number();
create trigger tasks_stamp before insert on public.tasks
  for each row execute function public.stamp_task_insert();
create trigger tasks_guard_update before update on public.tasks
  for each row execute function public.guard_task_update();

-- ---------------------------------------------------------------------------
-- Triggers de respuestas y adjuntos
-- ---------------------------------------------------------------------------
create function public.stamp_reply()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  via text := public.request_via();
begin
  if tg_op = 'INSERT' then
    if via <> 'sistema' then
      new.author_id := (select auth.uid());
      new.via := via;
      new.created_at := now();
    end if;
  else
    new.id := old.id;
    new.task_id := old.task_id;
    new.author_id := old.author_id;
    new.body := old.body;
    new.via := old.via;
    new.created_at := old.created_at;
  end if;

  if via = 'mcp' and new.mark = 'firmada' then
    raise exception 'Solo una persona desde la web puede firmar una decisión'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger replies_stamp before insert or update on public.replies
  for each row execute function public.stamp_reply();

create function public.stamp_attachment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  via text := public.request_via();
begin
  if via <> 'sistema' then
    new.uploaded_by := (select auth.uid());
    new.via := via;
    -- Los hashes los calcula el servidor (Fase 3), nunca el cliente.
    new.md5 := null;
    new.sha1 := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger attachments_stamp before insert on public.attachments
  for each row execute function public.stamp_attachment();

-- ---------------------------------------------------------------------------
-- Historial automático
-- ---------------------------------------------------------------------------
create function public.turn_label(t public.tasks)
returns text
language sql
stable
set search_path = ''
as $$
  select case t.turn
    when 'persona' then (select p.display_name from public.profiles p where p.id = t.turn_user_id)
    when 'tercero' then t.turn_third_party
    else 'nadie'
  end;
$$;

create function public.log_task_event()
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

create trigger tasks_log after insert or update on public.tasks
  for each row execute function public.log_task_event();
create trigger replies_log after insert or update on public.replies
  for each row execute function public.log_task_event();
create trigger attachments_log after insert on public.attachments
  for each row execute function public.log_task_event();

revoke execute on function public.assign_task_number() from public, anon, authenticated;
revoke execute on function public.log_task_event() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_repos enable row level security;
alter table public.tasks enable row level security;
alter table public.replies enable row level security;
alter table public.attachments enable row level security;
alter table public.task_events enable row level security;
alter table public.git_events enable row level security;
alter table public.task_git_links enable row level security;

-- Proyectos: se ven los propios. Crear, archivar y cambiar miembros llega en la Fase 3.
create policy "projects: miembros leen" on public.projects
  for select to authenticated using (public.is_member(id));

create policy "project_members: miembros leen" on public.project_members
  for select to authenticated using (public.is_member(project_id));

create policy "project_repos: miembros leen" on public.project_repos
  for select to authenticated using (public.is_member(project_id));

-- Tareas: miembros leen, crean y editan. No hay delete.
create policy "tasks: miembros leen" on public.tasks
  for select to authenticated using (public.is_member(project_id));
create policy "tasks: miembros crean" on public.tasks
  for insert to authenticated with check (public.is_member(project_id));
create policy "tasks: miembros editan" on public.tasks
  for update to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));

-- Respuestas: miembros leen, responden y marcan. No hay delete.
create policy "replies: miembros leen" on public.replies
  for select to authenticated using (public.is_member(public.task_project(task_id)));
create policy "replies: miembros responden" on public.replies
  for insert to authenticated with check (public.is_member(public.task_project(task_id)));
create policy "replies: miembros marcan" on public.replies
  for update to authenticated
  using (public.is_member(public.task_project(task_id)))
  with check (public.is_member(public.task_project(task_id)));

-- Adjuntos: miembros leen y suben. El hash lo completa el servidor.
create policy "attachments: miembros leen" on public.attachments
  for select to authenticated using (public.is_member(public.task_project(task_id)));
create policy "attachments: miembros suben" on public.attachments
  for insert to authenticated with check (public.is_member(public.task_project(task_id)));

-- Historial y Git: solo lectura para miembros.
create policy "task_events: miembros leen" on public.task_events
  for select to authenticated using (public.is_member(public.task_project(task_id)));
create policy "git_events: miembros leen" on public.git_events
  for select to authenticated using (project_id is not null and public.is_member(project_id));
create policy "task_git_links: miembros leen" on public.task_git_links
  for select to authenticated using (public.is_member(public.task_project(task_id)));

-- Lo que no tiene política tampoco tiene privilegio: defensa en profundidad.
revoke all on public.task_events, public.git_events, public.task_git_links from anon, authenticated;
grant select on public.task_events, public.git_events, public.task_git_links to authenticated;
revoke delete, truncate on public.tasks, public.replies, public.attachments from anon, authenticated;
revoke insert, update, delete, truncate on public.projects, public.project_members, public.project_repos
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado de adjuntos, path {project_id}/{task_id}/{uuid}-{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create function public.storage_project(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy "attachments bucket: miembros leen" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.is_member(public.storage_project(name)));
create policy "attachments bucket: miembros suben" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member(public.storage_project(name)));
