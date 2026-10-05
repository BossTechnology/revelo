-- Fase 3: hashes solo del servidor, create_project y Realtime.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('0000000c-0000-4000-8000-000000000001', 'creador@test.local', 'authenticated', 'authenticated', '{"display_name": "Creador"}'),
  ('0000000c-0000-4000-8000-000000000002', 'invitada@test.local', 'authenticated', 'authenticated', '{"display_name": "Invitada"}');

-- ---------------------------------------------------------------------------
-- Hashes: solo service_role los escribe
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.set_attachment_hashes(uuid, text, text)', 'execute'),
  'authenticated no puede escribir hashes');
select ok(not has_function_privilege('anon', 'public.set_attachment_hashes(uuid, text, text)', 'execute'),
  'anon no puede escribir hashes');
select ok(has_function_privilege('service_role', 'public.set_attachment_hashes(uuid, text, text)', 'execute'),
  'service_role sí puede escribir hashes');

-- ---------------------------------------------------------------------------
-- create_project: quien lo crea queda como miembro
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000c-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(
  (public.create_project('Nuevo', 'nvo', '#000000', array['0000000c-0000-4000-8000-000000000002'::uuid])).key,
  'NVO', 'create_project normaliza el prefijo a mayúsculas'
);
select results_eq(
  $$ select user_id from public.project_members
     where project_id = (select id from public.projects where key = 'NVO') order by user_id $$,
  $$ values ('0000000c-0000-4000-8000-000000000001'::uuid), ('0000000c-0000-4000-8000-000000000002'::uuid) $$,
  'quien crea el proyecto y los invitados quedan como miembros'
);

-- El cliente intenta declarar hashes: el trigger los borra.
insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via)
values ((select id from public.projects where key = 'NVO'), 0, '', 'handoff', 'Con adjunto', 'tercero', 'x',
        '0000000c-0000-4000-8000-000000000001', 'web');
insert into public.attachments (task_id, storage_path, filename, size_bytes, md5, sha1, uploaded_by, via)
values ((select id from public.tasks where key = 'NVO-1'), 'x/y/z-a.txt', 'a.txt', 10,
        'hash-falso', 'hash-falso', '0000000c-0000-4000-8000-000000000001', 'web');
select results_eq(
  $$ select md5, sha1 from public.attachments where storage_path = 'x/y/z-a.txt' $$,
  $$ values (null::text, null::text) $$,
  'un cliente no puede declarar md5 ni sha1'
);
reset role;

select throws_ok(
  $$ set local role anon; select public.create_project('X', 'XX', '#000000') $$,
  '42501', null, 'anon no puede crear proyectos'
);
reset role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('tasks', 'replies', 'attachments', 'task_events') $$,
  array['tasks', 'replies', 'attachments', 'task_events'],
  'Realtime publica tareas, respuestas, adjuntos e historial'
);
select ok(
  not exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public'
                and tablename in ('allowed_emails', 'git_events')),
  'Realtime no publica allowed_emails ni git_events'
);

select * from finish();
rollback;
