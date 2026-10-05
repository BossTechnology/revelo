-- Fase 2: modelo de datos, RLS y triggers (PLAN.md §10.2).
-- Los guards descubren las tablas desde el catálogo: una tabla nueva entra sola en la revisión.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- ---------------------------------------------------------------------------
-- Guard que descubre: toda tabla de public tiene RLS y al menos una política
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select t.table_name::text
     from information_schema.tables t
     join pg_class c on c.relname = t.table_name
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.table_schema
     where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and not c.relrowsecurity $$,
  'toda tabla de public tiene RLS activado'
);
select is_empty(
  $$ select t.table_name::text
     from information_schema.tables t
     where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and not exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = t.table_name) $$,
  'toda tabla de public tiene al menos una política'
);
select cmp_ok(
  (select count(*)::int from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'),
  '>=', 11,
  'el guard ve las tablas (si el catálogo viniera vacío, los dos anteriores pasarían sin probar nada)'
);

-- ---------------------------------------------------------------------------
-- Ayuda: filas visibles en cada tabla de public para el rol de la sesión
-- ---------------------------------------------------------------------------
create schema tests_rls;
create function tests_rls.visible_rows()
returns table (tbl text, n bigint)
language plpgsql
as $$
declare
  r record;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' loop
    begin
      return query execute format('select %L::text, count(*) from public.%I', r.relname, r.relname);
    exception when insufficient_privilege then
      return query select r.relname::text, 0::bigint;  -- sin privilegio = no ve nada
    end;
  end loop;
end;
$$;
grant usage on schema tests_rls to anon, authenticated;
grant execute on function tests_rls.visible_rows() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datos propios del test (independientes del seed)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('0000000a-0000-4000-8000-000000000001', 'miembro@test.local', 'authenticated', 'authenticated', '{"display_name": "Miembro"}'),
  ('0000000a-0000-4000-8000-000000000002', 'ajeno@test.local', 'authenticated', 'authenticated', '{"display_name": "Ajeno"}');

insert into public.projects (id, name, key, color) values
  ('0000000b-0000-4000-8000-000000000001', 'Prueba', 'PRB', '#000000');
insert into public.project_members (project_id, user_id) values
  ('0000000b-0000-4000-8000-000000000001', '0000000a-0000-4000-8000-000000000001');

-- Como miembro (vía web), para que corran los triggers igual que en la app.
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000a-0000-4000-8000-000000000001", "role": "authenticated"}';

insert into public.tasks (project_id, number, key, type, title, turn, turn_user_id, created_by, created_via)
values ('0000000b-0000-4000-8000-000000000001', 0, '', 'handoff', 'Primera', 'persona',
        '0000000a-0000-4000-8000-000000000001', '0000000a-0000-4000-8000-000000000002', 'mcp');
insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via)
values ('0000000b-0000-4000-8000-000000000001', 0, '', 'externo', 'Segunda', 'tercero', 'platform team',
        '0000000a-0000-4000-8000-000000000001', 'web');

select results_eq(
  $$ select key, number from public.tasks where project_id = '0000000b-0000-4000-8000-000000000001' order by number $$,
  $$ values ('PRB-1'::text, 1), ('PRB-2'::text, 2) $$,
  'numeración: claves consecutivas con el prefijo del proyecto'
);
select results_eq(
  $$ select created_by, created_via from public.tasks where key = 'PRB-1' $$,
  $$ values ('0000000a-0000-4000-8000-000000000001'::uuid, 'web'::text) $$,
  'created_by y created_via los fija el servidor, no el cliente'
);
select is(
  (select kind from public.task_events where task_id = (select id from public.tasks where key = 'PRB-1')),
  'creada',
  'crear una tarea queda en el historial'
);

update public.tasks set status = 'en_proceso' where key = 'PRB-1';
update public.tasks set turn = 'tercero', turn_user_id = null, turn_third_party = 'repo admin' where key = 'PRB-1';
select results_eq(
  $$ select kind, from_value, to_value from public.task_events
     where task_id = (select id from public.tasks where key = 'PRB-1') and kind <> 'creada' order by id $$,
  $$ values ('estado'::text, 'por_hacer'::text, 'en_proceso'::text), ('turno', 'Miembro', 'repo admin') $$,
  'cambios de estado y de turno quedan en el historial'
);

insert into public.replies (task_id, author_id, body, via)
values ((select id from public.tasks where key = 'PRB-1'), '0000000a-0000-4000-8000-000000000002', 'Hola', 'mcp');
select results_eq(
  $$ select author_id, via from public.replies where body = 'Hola' $$,
  $$ values ('0000000a-0000-4000-8000-000000000001'::uuid, 'web'::text) $$,
  'autor y vía de la respuesta los fija el servidor'
);

-- Checks del turno
select throws_ok(
  $$ insert into public.tasks (project_id, number, key, type, title, turn, created_by, created_via)
     values ('0000000b-0000-4000-8000-000000000001', 0, '', 'pregunta', 'x', 'persona',
             '0000000a-0000-4000-8000-000000000001', 'web') $$,
  '23514', null, 'turno persona sin usuario: rechazado'
);
select throws_ok(
  $$ update public.tasks set status = 'terminado' where key = 'PRB-2' $$,
  '23514', null, 'terminado con turno abierto: rechazado'
);

-- Historial y Git: inmutables
select throws_ok($$ update public.task_events set kind = 'x' $$, '42501', null,
  'task_events: update rechazado');
select throws_ok($$ delete from public.task_events $$, '42501', null,
  'task_events: delete rechazado');
select throws_ok($$ update public.git_events set title = 'x' $$, '42501', null,
  'git_events: update rechazado');
select throws_ok($$ delete from public.git_events $$, '42501', null,
  'git_events: delete rechazado');
select throws_ok($$ delete from public.tasks where key = 'PRB-2' $$, '42501', null,
  'tasks: no se borra');
select throws_ok($$ delete from public.replies $$, '42501', null,
  'replies: no se borra');
reset role;

-- ---------------------------------------------------------------------------
-- Token de cliente MCP (claim client_id): lo hecho por una IA se deriva, no se declara
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000a-0000-4000-8000-000000000001", "role": "authenticated", "client_id": "claude"}';

insert into public.replies (task_id, author_id, body, via)
values ((select id from public.tasks where key = 'PRB-1'), '0000000a-0000-4000-8000-000000000001', 'Desde MCP', 'web');
select is((select via from public.replies where body = 'Desde MCP'), 'mcp',
  'MCP: via queda en mcp aunque el insert diga web');
select throws_ok(
  $$ insert into public.replies (task_id, author_id, body, mark, via)
     values ((select id from public.tasks where key = 'PRB-1'), '0000000a-0000-4000-8000-000000000001', 'Firmo', 'firmada', 'web') $$,
  '42501', null, 'MCP: responder con firmada, rechazado'
);
select throws_ok(
  $$ update public.replies set mark = 'firmada' where body = 'Hola' $$,
  '42501', null, 'MCP: marcar una respuesta como firmada, rechazado'
);
update public.tasks set turn = 'nadie', turn_third_party = null where key = 'PRB-1';
select throws_ok(
  $$ update public.tasks set status = 'terminado' where key = 'PRB-1' $$,
  '42501', null, 'MCP: cerrar un handoff, rechazado'
);
select lives_ok(
  $$ update public.tasks set turn = 'nadie', turn_third_party = null, status = 'terminado' where key = 'PRB-2' $$,
  'MCP: cerrar algo que no es handoff, permitido'
);
reset role;

-- La misma firma desde la web sí se permite.
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000a-0000-4000-8000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ update public.replies set mark = 'firmada' where body = 'Hola' $$,
  'web: una persona sí firma'
);
reset role;

-- ---------------------------------------------------------------------------
-- No miembro: no ve nada, no escribe nada
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000a-0000-4000-8000-000000000002", "role": "authenticated"}';

select is_empty(
  $$ select tbl from tests_rls.visible_rows() where n > 0 and tbl <> 'profiles' $$,
  'no miembro: 0 filas en todas las tablas (salvo perfiles)'
);
select throws_ok(
  $$ insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via)
     values ('0000000b-0000-4000-8000-000000000001', 0, '', 'pregunta', 'Intruso', 'tercero', 'x',
             '0000000a-0000-4000-8000-000000000002', 'web') $$,
  '42501', null, 'no miembro: crear tarea rechazado'
);
select throws_ok(
  $$ insert into public.replies (task_id, author_id, body, via)
     values ((select id from public.tasks limit 1), '0000000a-0000-4000-8000-000000000002', 'x', 'web') $$,
  null, null, 'no miembro: responder rechazado'
);
select throws_ok(
  $$ insert into public.project_members (project_id, user_id)
     values ('0000000b-0000-4000-8000-000000000001', '0000000a-0000-4000-8000-000000000002') $$,
  '42501', null, 'no miembro: unirse a un proyecto rechazado'
);
update public.tasks set title = 'Hackeado' where project_id = '0000000b-0000-4000-8000-000000000001';
select is(public.is_member('0000000b-0000-4000-8000-000000000001'), false, 'is_member: falso para el no miembro');
reset role;

select is(
  (select count(*)::int from public.tasks where title = 'Hackeado'),
  0, 'no miembro: editar tareas no cambia nada'
);

-- ---------------------------------------------------------------------------
-- anon: nada en ninguna tabla
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is_empty(
  $$ select tbl from tests_rls.visible_rows() where n > 0 $$,
  'anon: 0 filas en todas las tablas'
);
reset role;

-- ---------------------------------------------------------------------------
-- Miembro: sí ve su proyecto (el guard no pasa por no ver nada)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000a-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(
  (select count(*)::int from public.tasks where project_id = '0000000b-0000-4000-8000-000000000001'),
  2, 'miembro: ve las tareas de su proyecto'
);
select ok(
  (select count(*) from public.task_events
   where task_id in (select id from public.tasks where project_id = '0000000b-0000-4000-8000-000000000001')) > 0,
  'miembro: ve el historial de su proyecto'
);
reset role;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
select ok(
  (select not public from storage.buckets where id = 'attachments'),
  'el bucket attachments es privado'
);
select is(
  (select file_size_limit from storage.buckets where id = 'attachments'),
  52428800::bigint, 'el bucket attachments limita a 50 MB'
);

select * from finish();
rollback;
