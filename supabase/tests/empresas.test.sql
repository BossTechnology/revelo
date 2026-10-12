-- Fase 7: empresas y categorías (docs/adr/0001).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('0000000d-0000-4000-8000-000000000001', 'ana@empresas.local', 'authenticated', 'authenticated', '{"display_name": "Ana"}'),
  ('0000000d-0000-4000-8000-000000000002', 'beto@empresas.local', 'authenticated', 'authenticated', '{"display_name": "Beto"}');

insert into public.companies (id, name) values
  ('0000000d-0000-4000-8000-0000000000c1', 'Empresa Uno'),
  ('0000000d-0000-4000-8000-0000000000c2', 'Empresa Dos');
insert into public.projects (id, name, key, color, company_id) values
  ('0000000d-0000-4000-8000-0000000000a1', 'Uno', 'UNO', '#000000', '0000000d-0000-4000-8000-0000000000c1'),
  ('0000000d-0000-4000-8000-0000000000a2', 'Dos', 'DOS', '#000000', '0000000d-0000-4000-8000-0000000000c2');
insert into public.project_members (project_id, user_id) values
  ('0000000d-0000-4000-8000-0000000000a1', '0000000d-0000-4000-8000-000000000001'),
  ('0000000d-0000-4000-8000-0000000000a2', '0000000d-0000-4000-8000-000000000002');
insert into public.categories (id, project_id, name) values
  ('0000000d-0000-4000-8000-0000000000e1', '0000000d-0000-4000-8000-0000000000a1', 'Frente uno'),
  ('0000000d-0000-4000-8000-0000000000e2', '0000000d-0000-4000-8000-0000000000a2', 'Frente dos');

-- Ana, miembro solo del proyecto UNO, vía web.
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000d-0000-4000-8000-000000000001", "role": "authenticated"}';

-- ---------------------------------------------------------------------------
-- Visibilidad
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select name from public.companies where name like 'Empresa %' order by name $$,
  $$ values ('Empresa Uno'::text) $$,
  'una empresa solo se ve si eres miembro de alguno de sus proyectos'
);
select results_eq(
  $$ select name from public.categories where name like 'Frente %' $$,
  $$ values ('Frente uno'::text) $$,
  'las categorías de un proyecto ajeno no se ven'
);

-- ---------------------------------------------------------------------------
-- Una tarea solo puede tener una categoría de su propio proyecto
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via, category_id)
     values ('0000000d-0000-4000-8000-0000000000a1', 0, '', 'handoff', 'Cruzada', 'tercero', 'x',
             '0000000d-0000-4000-8000-000000000001', 'web', '0000000d-0000-4000-8000-0000000000e2') $$,
  '23503', null, 'una tarea no puede quedar con la categoría de otro proyecto'
);

insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via)
values ('0000000d-0000-4000-8000-0000000000a1', 0, '', 'handoff', 'Sin categoría', 'tercero', 'x',
        '0000000d-0000-4000-8000-000000000001', 'web');
update public.tasks set category_id = '0000000d-0000-4000-8000-0000000000e1' where key = 'UNO-1';
select is(
  (select category_id from public.tasks where key = 'UNO-1'),
  '0000000d-0000-4000-8000-0000000000e1'::uuid,
  'una tarea puede tomar una categoría de su proyecto'
);
select results_eq(
  $$ select kind, from_value, to_value from public.task_events
     where task_id = (select id from public.tasks where key = 'UNO-1') and kind = 'categoria' $$,
  $$ values ('categoria'::text, null::text, 'Frente uno'::text) $$,
  'cambiar la categoría queda en el historial con su nombre'
);

-- ---------------------------------------------------------------------------
-- Categorías: miembros crean y archivan; nadie borra
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.categories (project_id, name) values ('0000000d-0000-4000-8000-0000000000a2', 'Intrusa') $$,
  '42501', null, 'no se crean categorías en un proyecto ajeno'
);
select lives_ok(
  $$ update public.categories set archived_at = now() where id = '0000000d-0000-4000-8000-0000000000e1' $$,
  'un miembro archiva una categoría de su proyecto'
);
select throws_ok(
  $$ delete from public.categories where id = '0000000d-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'las categorías no se borran'
);

-- ---------------------------------------------------------------------------
-- Empresas y create_project
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.projects set company_id = '0000000d-0000-4000-8000-0000000000c2'
     where id = '0000000d-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'un usuario no mueve un proyecto de empresa'
);
select throws_ok(
  $$ select public.create_project('Infiltrado', 'INF', '#000000', 'empresa dos') $$,
  '42501', null, 'no se crea un proyecto en una empresa donde no eres miembro'
);
do $$
begin
  perform public.create_project('Otro', 'OTR', '#000000', '  empresa uno ');
  perform public.create_project('Nuevo', 'NUE', '#000000', 'Empresa Tres');
end $$;
select is(
  (select c.name from public.companies c join public.projects p on p.company_id = c.id where p.key = 'OTR'),
  'Empresa Uno',
  'el nombre de la empresa se compara sin mayúsculas ni espacios'
);
select is(
  (select c.name from public.companies c join public.projects p on p.company_id = c.id where p.key = 'NUE'),
  'Empresa Tres',
  'una empresa nueva se crea con su primer proyecto y quien la crea la ve'
);

select * from finish();
rollback;
