-- Fase 3: trabajo diario.
--  * Realtime en tareas, respuestas, adjuntos e historial: lo que hace la otra persona (o su IA)
--    aparece sin recargar. Realtime respeta RLS: solo llegan cambios de proyectos propios.
--  * create_project(): crear un proyecto y sus miembros en una sola operación. Quien lo crea
--    queda siempre como miembro.
--  * set_attachment_hashes(): los hashes los escribe solo el servidor (service role) después de
--    leer el archivo de Storage. Ningún usuario puede fijarlos.

alter publication supabase_realtime add table public.tasks, public.replies, public.attachments, public.task_events;

create function public.create_project(
  project_name text,
  project_key text,
  project_color text,
  member_ids uuid[] default '{}'
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  created public.projects;
begin
  if me is null then
    raise exception 'Hace falta una sesión' using errcode = '42501';
  end if;
  if btrim(coalesce(project_name, '')) = '' then
    raise exception 'El proyecto necesita un nombre' using errcode = '23514';
  end if;

  insert into public.projects (name, key, color)
  values (btrim(project_name), upper(btrim(project_key)), project_color)
  returning * into created;

  insert into public.project_members (project_id, user_id)
  select created.id, m
  from unnest(array_append(coalesce(member_ids, '{}'), me)) as m
  where exists (select 1 from public.profiles p where p.id = m)
  on conflict do nothing;

  return created;
end;
$$;

revoke execute on function public.create_project(text, text, text, uuid[]) from public, anon;
grant execute on function public.create_project(text, text, text, uuid[]) to authenticated;

create function public.set_attachment_hashes(attachment uuid, md5_hex text, sha1_hex text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.attachments set md5 = md5_hex, sha1 = sha1_hex where id = attachment;
$$;

revoke execute on function public.set_attachment_hashes(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_attachment_hashes(uuid, text, text) to service_role;
