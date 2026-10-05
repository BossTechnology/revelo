-- Fase 5: repos, miembros y ajustes del proyecto; historial de vínculos de Git.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('0000000e-0000-4000-8000-000000000001', 'miembro@gh.local', 'authenticated', 'authenticated', '{"display_name": "Miembro GH"}'),
  ('0000000e-0000-4000-8000-000000000002', 'ajeno@gh.local', 'authenticated', 'authenticated', '{"display_name": "Ajeno GH"}');
insert into public.projects (id, name, key, color) values ('0000000f-0000-4000-8000-000000000001', 'GH', 'GHP', '#000000');
insert into public.project_members values ('0000000f-0000-4000-8000-000000000001', '0000000e-0000-4000-8000-000000000001');

-- Miembro: conecta un repo, cambia nombre, no cambia el prefijo.
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000e-0000-4000-8000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.project_repos values ('0000000f-0000-4000-8000-000000000001', 'org', 'repo', 1) $$,
  'un miembro conecta un repo'
);
select lives_ok(
  $$ update public.projects set name = 'GH nuevo' where key = 'GHP' $$,
  'un miembro cambia el nombre'
);
select throws_ok(
  $$ update public.projects set key = 'OTRO' where key = 'GHP' $$,
  '42501', null, 'nadie cambia el prefijo'
);
reset role;

-- Ajeno: no conecta repos ni se suma al proyecto.
set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000e-0000-4000-8000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.project_repos values ('0000000f-0000-4000-8000-000000000001', 'org', 'otro', 1) $$,
  '42501', null, 'un no miembro no conecta repos'
);
select throws_ok(
  $$ insert into public.project_members values ('0000000f-0000-4000-8000-000000000001', '0000000e-0000-4000-8000-000000000002') $$,
  '42501', null, 'un no miembro no se suma solo a un proyecto'
);
reset role;

-- Vincular Git queda en el historial con via github.
insert into public.tasks (project_id, number, key, type, title, turn, turn_third_party, created_by, created_via)
values ('0000000f-0000-4000-8000-000000000001', 0, '', 'handoff', 'Con PR', 'tercero', 'x', '0000000e-0000-4000-8000-000000000001', 'web');
insert into public.git_events (delivery_id, project_id, owner, repo, kind, ref, pr_number, state, payload, occurred_at)
values ('gh-test-1', '0000000f-0000-4000-8000-000000000001', 'org', 'repo', 'pull_request', 'ghp-1-x', 7, 'merged', '{}', now());
insert into public.task_git_links
select t.id, e.id, 'branch' from public.tasks t, public.git_events e where t.key = 'GHP-1' and e.delivery_id = 'gh-test-1';
select results_eq(
  $$ select via, kind, to_value from public.task_events
     where task_id = (select id from public.tasks where key = 'GHP-1') and kind = 'git_vinculado' $$,
  $$ values ('github'::text, 'git_vinculado'::text, 'PR #7 merged'::text) $$,
  'vincular un PR queda en el historial (via github)'
);

-- Un delivery repetido no se guarda dos veces.
select throws_ok(
  $$ insert into public.git_events (delivery_id, owner, repo, kind, payload, occurred_at)
     values ('gh-test-1', 'org', 'repo', 'push', '{}', now()) $$,
  '23505', null, 'delivery_id es único'
);

select * from finish();
rollback;
