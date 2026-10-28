-- Fase 8: miembros lectores (docs/adr/0002).
-- Los dos guards descubren desde el catálogo: una política o una función nueva entra sola en la
-- revisión. Después, un lector intenta cada escritura y falla.
begin;
create extension if not exists pgtap with schema extensions;

select plan(55);

-- ---------------------------------------------------------------------------
-- Guard 1: toda política de insert, update o delete pasa por puede_editar()
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select format('%s.%s · %s', schemaname, tablename, policyname)
     from pg_policies
     where schemaname in ('public', 'storage')
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (coalesce(qual, with_check) ~ 'puede_editar\('
                and coalesce(with_check, qual) ~ 'puede_editar\(')
       and (schemaname, tablename, policyname) not in (
         -- Cada quien edita su propio perfil: no depende de ningún proyecto.
         ('public', 'profiles', 'profiles: cada quien edita su perfil')
       ) $$,
  'toda política de insert, update o delete usa puede_editar() (salvo la lista revisada)'
);
-- Mencionar puede_editar() no basta: `puede_editar(x) or is_member(x)` dejaría escribir al lector.
select is_empty(
  $$ select format('%s.%s · %s', schemaname, tablename, policyname)
     from pg_policies
     where schemaname in ('public', 'storage')
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and concat_ws(' ', qual, with_check) ~* '\mor\M'
       and (schemaname, tablename, policyname) not in (
         -- Un editor quita a otros o cada quien se sale: el OR es la regla.
         ('public', 'project_members', 'project_members: editores quitan, cada quien se sale')
       ) $$,
  'ninguna política de escritura abre otra vía con OR (salvo la lista revisada)'
);
select cmp_ok(
  (select count(*)::int from pg_policies
   where schemaname in ('public', 'storage') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  '>=', 15,
  'el guard ve las políticas de escritura (si viniera vacío, pasaría sin probar nada)'
);

-- ---------------------------------------------------------------------------
-- Guard 2: funciones security definer que puede ejecutar authenticated
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select format('%s.%s(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes))
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef
       and n.nspname not in ('pg_catalog', 'information_schema')
       and has_function_privilege('authenticated', p.oid, 'execute')
     except
     select unnest(array[
       'public.is_member(uuid)',              -- políticas de lectura
       'public.puede_editar(uuid)',           -- políticas de escritura
       'public.task_project(uuid)',           -- políticas de respuestas, adjuntos e historial
       'public.is_company_member(uuid)',      -- lectura de empresas
       'public.mcp_hit(integer)',             -- contador del MCP por persona; el lector lo usa
       'public.create_project(text, text, text, text, uuid[], uuid[])',  -- exige ser editor
       'supabase_functions.http_request()'    -- de Supabase (webhooks de base de datos)
     ]) $$,
  'ninguna función security definer ejecutable por authenticated fuera de la lista revisada'
);
select cmp_ok(
  (select count(*)::int from pg_proc p
   where p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')),
  '>=', 6,
  'el guard ve las funciones security definer'
);

-- ---------------------------------------------------------------------------
-- Datos propios del test
--   LEC: Edi y Eva editoras, Leo lector (sumado sin decir acceso: queda lector por defecto).
--   LEQ: Ana editora; ni Edi ni Leo son miembros.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000010-0000-4000-8000-000000000001', 'edi@lectores.local', 'authenticated', 'authenticated', '{"display_name": "Edi"}'),
  ('00000010-0000-4000-8000-000000000002', 'eva@lectores.local', 'authenticated', 'authenticated', '{"display_name": "Eva"}'),
  ('00000010-0000-4000-8000-000000000003', 'leo@lectores.local', 'authenticated', 'authenticated', '{"display_name": "Leo"}'),
  ('00000010-0000-4000-8000-000000000004', 'ana@lectores.local', 'authenticated', 'authenticated', '{"display_name": "Ana"}');

insert into public.companies (id, name) values ('00000010-0000-4000-8000-0000000000c1', 'Empresa Lectores');
insert into public.projects (id, name, key, color, company_id) values
  ('00000010-0000-4000-8000-0000000000a1', 'Lectura', 'LEC', '#000000', '00000010-0000-4000-8000-0000000000c1'),
  ('00000010-0000-4000-8000-0000000000a2', 'Otro', 'LEQ', '#000000', '00000010-0000-4000-8000-0000000000c1');
insert into public.project_members (project_id, user_id, acceso) values
  ('00000010-0000-4000-8000-0000000000a1', '00000010-0000-4000-8000-000000000001', 'editor'),
  ('00000010-0000-4000-8000-0000000000a1', '00000010-0000-4000-8000-000000000002', 'editor'),
  ('00000010-0000-4000-8000-0000000000a2', '00000010-0000-4000-8000-000000000004', 'editor');
insert into public.project_members (project_id, user_id) values
  ('00000010-0000-4000-8000-0000000000a1', '00000010-0000-4000-8000-000000000003');
insert into public.categories (id, project_id, name) values
  ('00000010-0000-4000-8000-0000000000e1', '00000010-0000-4000-8000-0000000000a1', 'Frente');
insert into public.project_repos (project_id, owner, repo, installation_id) values
  ('00000010-0000-4000-8000-0000000000a1', 'org', 'lectura', 1);

-- Como Edi (vía web), para que corran los triggers igual que en la app.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000010-0000-4000-8000-000000000001", "role": "authenticated"}';
insert into public.tasks (project_id, number, key, type, title, turn, turn_user_id, created_by, created_via)
values ('00000010-0000-4000-8000-0000000000a1', 0, '', 'handoff', 'Original', 'persona',
        '00000010-0000-4000-8000-000000000001', '00000010-0000-4000-8000-000000000001', 'web'),
       ('00000010-0000-4000-8000-0000000000a1', 0, '', 'pregunta', 'De Eva', 'persona',
        '00000010-0000-4000-8000-000000000002', '00000010-0000-4000-8000-000000000001', 'web');
insert into public.replies (task_id, author_id, body, via)
values ((select id from public.tasks where key = 'LEC-1'), '00000010-0000-4000-8000-000000000001', 'Hola', 'web');
insert into public.attachments (task_id, storage_path, filename, size_bytes, uploaded_by, via)
values ((select id from public.tasks where key = 'LEC-1'),
        '00000010-0000-4000-8000-0000000000a1/x/y-a.txt', 'a.txt', 10, '00000010-0000-4000-8000-000000000001', 'web');
reset role;
insert into storage.objects (bucket_id, name)
values ('attachments', '00000010-0000-4000-8000-0000000000a1/x/y-a.txt');

select is(
  (select acceso::text from public.project_members
   where user_id = '00000010-0000-4000-8000-000000000003'),
  'lector', 'quien se suma sin decir acceso queda como lector'
);

-- ---------------------------------------------------------------------------
-- Lector: ve todo su proyecto y nada más
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000010-0000-4000-8000-000000000003", "role": "authenticated"}';

select is(
  (select count(*)::int from public.tasks where project_id = '00000010-0000-4000-8000-0000000000a1'),
  2, 'lector: ve las tareas de su proyecto'
);
select ok(
  (select count(*) from public.replies) = 1
  and (select count(*) from public.attachments) = 1
  and (select count(*) from public.task_events) > 0
  and (select count(*) from public.categories) = 1
  and (select count(*) from public.project_repos) = 1
  and (select count(*) from public.project_members) = 3,
  'lector: ve hilos, adjuntos, historial, categorías, repos y miembros'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'attachments'),
  1, 'lector: ve el archivo del adjunto en Storage (puede descargarlo)'
);
select results_eq(
  $$ select name from public.companies $$,
  $$ values ('Empresa Lectores'::text) $$,
  'lector: ve el nombre de la empresa de su proyecto'
);
select results_eq(
  $$ select key from public.projects $$,
  $$ values ('LEC'::text) $$,
  'lector: no ve otros proyectos, ni siquiera de su misma empresa'
);
select set_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000010-0000-4000-8000-000000000001'::uuid),
            ('00000010-0000-4000-8000-000000000002'::uuid),
            ('00000010-0000-4000-8000-000000000003'::uuid) $$,
  'lector: ve su perfil y los de quienes comparten proyecto con él, ningún otro'
);
select is(public.puede_editar('00000010-0000-4000-8000-0000000000a1'), false, 'puede_editar: falso para el lector');
select is(public.is_member('00000010-0000-4000-8000-0000000000a1'), true, 'is_member: verdadero para el lector');
select ok(public.mcp_hit(), 'lector: el contador del MCP le funciona');

-- ---------------------------------------------------------------------------
-- Lector: cada escritura falla
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via)
     values ('00000010-0000-4000-8000-0000000000a1', 0, '', 'pregunta', 'Del lector', 'tercero', 'x',
             '00000010-0000-4000-8000-000000000003', 'web') $$,
  '42501', null, 'lector: crear tarea rechazado'
);
update public.tasks set title = 'Del lector', status = 'en_proceso'
where project_id = '00000010-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int from public.tasks where title = 'Del lector' or status = 'en_proceso'),
  0, 'lector: editar o mover tareas no cambia nada'
);
update public.tasks set turn_user_id = '00000010-0000-4000-8000-000000000003'
where project_id = '00000010-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int from public.tasks where turn_user_id = '00000010-0000-4000-8000-000000000003'),
  0, 'lector: tomar el turno no cambia nada'
);
select throws_ok(
  $$ insert into public.replies (task_id, author_id, body, via)
     values ((select id from public.tasks where key = 'LEC-1'), '00000010-0000-4000-8000-000000000003', 'x', 'web') $$,
  '42501', null, 'lector: responder rechazado'
);
update public.replies set mark = 'oficial';
select is(
  (select count(*)::int from public.replies where mark <> 'normal'),
  0, 'lector: marcar una respuesta no cambia nada'
);
select throws_ok(
  $$ insert into public.attachments (task_id, storage_path, filename, size_bytes, uploaded_by, via)
     values ((select id from public.tasks where key = 'LEC-1'),
             '00000010-0000-4000-8000-0000000000a1/x/z-b.txt', 'b.txt', 10,
             '00000010-0000-4000-8000-000000000003', 'web') $$,
  '42501', null, 'lector: registrar un adjunto rechazado'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', '00000010-0000-4000-8000-0000000000a1/x/z-b.txt') $$,
  '42501', null, 'lector: subir un archivo a Storage rechazado'
);
select throws_ok(
  $$ insert into public.categories (project_id, name) values ('00000010-0000-4000-8000-0000000000a1', 'Del lector') $$,
  '42501', null, 'lector: crear categoría rechazado'
);
update public.categories set name = 'Del lector', archived_at = now();
select is(
  (select count(*)::int from public.categories where name = 'Del lector' or archived_at is not null),
  0, 'lector: renombrar o archivar categorías no cambia nada'
);
select throws_ok(
  $$ insert into public.project_repos values ('00000010-0000-4000-8000-0000000000a1', 'org', 'otro', 1) $$,
  '42501', null, 'lector: conectar un repo rechazado'
);
delete from public.project_repos;
select is((select count(*)::int from public.project_repos), 1, 'lector: desconectar un repo no cambia nada');
select throws_ok(
  $$ insert into public.project_members (project_id, user_id)
     values ('00000010-0000-4000-8000-0000000000a1', '00000010-0000-4000-8000-000000000004') $$,
  '42501', null, 'lector: sumar miembros rechazado'
);
update public.project_members set acceso = 'editor';
select is(
  (select count(*)::int from public.project_members where acceso = 'editor'),
  2, 'lector: cambiar accesos (ni el propio) no cambia nada'
);
delete from public.project_members where user_id <> '00000010-0000-4000-8000-000000000003';
select is((select count(*)::int from public.project_members), 3, 'lector: quitar a otros no cambia nada');
update public.projects set name = 'Del lector', archived_at = now();
select is(
  (select count(*)::int from public.projects where name = 'Del lector' or archived_at is not null),
  0, 'lector: renombrar o archivar el proyecto no cambia nada'
);
update public.companies set name = 'Del lector';
select is(
  (select name from public.companies), 'Empresa Lectores', 'lector: renombrar la empresa no cambia nada'
);
select throws_ok(
  $$ select public.create_project('Del lector', 'LDL', '#000000', 'Empresa Lectores') $$,
  '42501', null, 'lector: crear un proyecto en la empresa de su proyecto rechazado'
);
select throws_ok(
  $$ select public.create_project('Del lector', 'LDL', '#000000', 'Empresa del lector') $$,
  '42501', null, 'lector: crear un proyecto en una empresa nueva rechazado'
);
reset role;

-- Como MCP (token con client_id): mismas reglas.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000010-0000-4000-8000-000000000003", "role": "authenticated", "client_id": "claude"}';
select throws_ok(
  $$ insert into public.replies (task_id, author_id, body, via)
     values ((select id from public.tasks where key = 'LEC-1'), '00000010-0000-4000-8000-000000000003', 'x', 'mcp') $$,
  '42501', null, 'lector vía MCP: responder rechazado'
);
reset role;

-- ---------------------------------------------------------------------------
-- Ana (no miembro de LEC): RLS la rechaza antes de que el trigger del turno revele nada
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000010-0000-4000-8000-000000000004", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.tasks (project_id, number, key, type, title, turn, turn_user_id, created_by, created_via)
     values ('00000010-0000-4000-8000-0000000000a1', 0, '', 'pregunta', 'Sondeo', 'persona',
             '00000010-0000-4000-8000-000000000003', '00000010-0000-4000-8000-000000000004', 'web') $$,
  '42501', 'new row violates row-level security policy for table "tasks"',
  'no miembro: el turno a un lector ajeno da el error de RLS, no el nombre ni el acceso'
);
reset role;

-- ---------------------------------------------------------------------------
-- Editora: el turno no puede quedar en manos de un lector
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000010-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(public.puede_editar('00000010-0000-4000-8000-0000000000a1'), true, 'puede_editar: verdadero para la editora');
select ok(
  exists (select 1 from public.profiles where id = '00000010-0000-4000-8000-000000000004'),
  'editora: ve todos los perfiles (para sumar a alguien recién invitado)'
);
select throws_like(
  $$ update public.tasks set turn_user_id = '00000010-0000-4000-8000-000000000003' where key = 'LEC-1' $$,
  '%Leo%solo lectura%', 'pasarle el turno a un lector, rechazado'
);
select throws_like(
  $$ insert into public.tasks (project_id, number, key, type, title, turn, turn_user_id, created_by, created_via)
     values ('00000010-0000-4000-8000-0000000000a1', 0, '', 'pregunta', 'Para Leo', 'persona',
             '00000010-0000-4000-8000-000000000003', '00000010-0000-4000-8000-000000000001', 'web') $$,
  '%Leo%solo lectura%', 'crear una tarea con el turno de un lector, rechazado'
);

-- ---------------------------------------------------------------------------
-- Editora: gestión de miembros
-- ---------------------------------------------------------------------------
select throws_like(
  $$ update public.project_members set acceso = 'lector'
     where user_id = '00000010-0000-4000-8000-000000000002' $$,
  '%Eva%LEC-2%', 'bajar a lector a alguien con tareas en su turno, rechazado (y las lista)'
);
select throws_like(
  $$ delete from public.project_members where user_id = '00000010-0000-4000-8000-000000000002' $$,
  '%Eva%LEC-2%', 'quitar a alguien con tareas en su turno, rechazado (y las lista)'
);

update public.tasks set turn_user_id = '00000010-0000-4000-8000-000000000001' where key = 'LEC-2';
select lives_ok(
  $$ update public.project_members set acceso = 'lector'
     where user_id = '00000010-0000-4000-8000-000000000002' $$,
  'sin tareas en su turno, una editora baja a lector a otra'
);
select is(
  (select acceso::text from public.project_members where user_id = '00000010-0000-4000-8000-000000000002'),
  'lector', 'Eva quedó como lectora'
);

-- Edi es ahora la única editora.
select throws_like(
  $$ update public.project_members set acceso = 'lector'
     where user_id = '00000010-0000-4000-8000-000000000001' $$,
  '%sin editor%', 'la última editora no se baja a lector'
);
select throws_like(
  $$ delete from public.project_members where user_id = '00000010-0000-4000-8000-000000000001' $$,
  '%sin editor%', 'la última editora no se sale del proyecto'
);

select lives_ok(
  $$ update public.project_members set acceso = 'editor'
     where user_id = '00000010-0000-4000-8000-000000000003' $$,
  'una editora sube a editor a un lector'
);
select lives_ok(
  $$ update public.project_members set acceso = 'lector'
     where user_id = '00000010-0000-4000-8000-000000000003' $$,
  'y lo vuelve a bajar'
);
select throws_ok(
  $$ update public.project_members set project_id = '00000010-0000-4000-8000-0000000000a2'
     where user_id = '00000010-0000-4000-8000-000000000003' $$,
  '42501', null, 'de un miembro solo cambia el acceso: no se mueve de proyecto'
);
select lives_ok(
  $$ delete from public.project_members where user_id = '00000010-0000-4000-8000-000000000002' $$,
  'una editora quita a una lectora sin tareas en su turno'
);
select lives_ok(
  $$ insert into public.project_members (project_id, user_id)
     values ('00000010-0000-4000-8000-0000000000a1', '00000010-0000-4000-8000-000000000002') $$,
  'una editora suma a una persona (queda lectora)'
);

-- Empresas y create_project
update public.companies set name = 'Empresa Renombrada' where id = '00000010-0000-4000-8000-0000000000c1';
select is(
  (select name from public.companies where id = '00000010-0000-4000-8000-0000000000c1'),
  'Empresa Renombrada', 'una editora de algún proyecto de la empresa la renombra'
);
select is(
  (public.create_project('Nuevo', 'len', '#000000', 'Empresa Renombrada',
     array['00000010-0000-4000-8000-000000000003'::uuid],
     array['00000010-0000-4000-8000-000000000004'::uuid])).key,
  'LEN', 'una editora crea un proyecto en su empresa'
);
select results_eq(
  $$ select user_id, acceso::text from public.project_members
     where project_id = (select id from public.projects where key = 'LEN') order by user_id $$,
  $$ values ('00000010-0000-4000-8000-000000000001'::uuid, 'editor'::text),
            ('00000010-0000-4000-8000-000000000003'::uuid, 'editor'::text),
            ('00000010-0000-4000-8000-000000000004'::uuid, 'lector'::text) $$,
  'create_project: quien crea queda como editor y cada persona con el acceso elegido'
);
reset role;

-- ---------------------------------------------------------------------------
-- Lector: puede salirse del proyecto
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000010-0000-4000-8000-000000000003", "role": "authenticated"}';
select lives_ok(
  $$ delete from public.project_members
     where project_id = '00000010-0000-4000-8000-0000000000a1' and user_id = '00000010-0000-4000-8000-000000000003' $$,
  'un lector se sale del proyecto'
);
select is(public.is_member('00000010-0000-4000-8000-0000000000a1'), false, 'y deja de verlo');
reset role;

select * from finish();
rollback;
