-- Seed local (PLAN.md §9, Fase 2): las dos personas, los 3 proyectos y las tareas del canvas.
-- Solo para `supabase start` / `db reset` en local. Nunca se aplica a staging ni a prod.
--
-- Para entrar en local: pide el enlace mágico para henry@relevo.test o federico@relevo.test y
-- ábrelo desde Mailpit (http://127.0.0.1:55324).

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------
insert into public.allowed_emails (email) values ('henry@relevo.test'), ('federico@relevo.test');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated',
   'authenticated', 'henry@relevo.test', '', now(),
   '{"provider": "email", "providers": ["email"]}', '{"display_name": "Henry", "role": "desarrollo"}',
   now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated',
   'authenticated', 'federico@relevo.test', '', now(),
   '{"provider": "email", "providers": ["email"]}', '{"display_name": "Federico", "role": "arquitectura"}',
   now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email in ('henry@relevo.test', 'federico@relevo.test');

-- Colores de turno del canvas.
update public.profiles set turn_color = '#2E4FD0' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set turn_color = '#C2410C' where id = '22222222-2222-4222-8222-222222222222';

-- ---------------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------------
insert into public.projects (id, name, key, color, next_number) values
  ('aaaaaaaa-0000-4000-8000-00000000b0b0', 'BOb', 'BOB', '#7C3AED', 10),
  ('aaaaaaaa-0000-4000-8000-0000000b2b2b', 'BzzzBX', 'BZX', '#0E7490', 1),
  ('aaaaaaaa-0000-4000-8000-00000000303f', 'Momentum', 'MOM', '#B45309', 7);

insert into public.project_members (project_id, user_id)
select p.id, u.id
from public.projects p
cross join (values ('11111111-1111-4111-8111-111111111111'::uuid),
                   ('22222222-2222-4222-8222-222222222222'::uuid)) as u(id);

insert into public.project_repos (project_id, owner, repo, installation_id) values
  ('aaaaaaaa-0000-4000-8000-00000000b0b0', 'BossTechnology', 'Bob-New', 1),
  ('aaaaaaaa-0000-4000-8000-0000000b2b2b', 'BossTechnology', 'bzzzbx', 1),
  ('aaaaaaaa-0000-4000-8000-00000000303f', 'BossTechnology', 'momentum', 1),
  ('aaaaaaaa-0000-4000-8000-00000000303f', 'otra-org', 'momentum-sim', 2);

-- ---------------------------------------------------------------------------
-- Tareas (en orden de número: el trigger asigna BOB-10, BOB-11…)
-- ---------------------------------------------------------------------------
create temporary table seed_tasks (
  project text, aliases text[], type public.task_type, title text, status public.task_status,
  turn public.turn_kind, who text, third text, due date, age interval, body text
) on commit drop;

insert into seed_tasks values
  -- BOb (BOB-10 … BOB-18)
  ('BOB', '{N-05}', 'pregunta', '¿Projection / Evidence Packages existe o es solo un concepto?', 'terminado', 'nadie', null, null, null, '28 days',
   'Pregunta heredada del Google Doc (N-05). Respondida por el lado de BzzzBX.'),
  ('BOB', '{N-07}', 'pregunta', '¿La redacción de PII elimina nombres antes de Hivemonic?', 'terminado', 'nadie', null, null, null, '28 days',
   'Pregunta heredada del Google Doc (N-07).'),
  ('BOB', '{}', 'handoff', 'Slice 1b – correcciones, 74 tests', 'terminado', 'nadie', null, null, null, '27 days',
   E'## Instrucciones\n\nAplicar las correcciones del slice 1b y correr la suite completa.\n\n## Report-back\n\n- [x] 74 tests en verde'),
  ('BOB', '{}', 'decision', 'Postgres 17.6 se mantiene; el pin se revisa con el primer VPS', 'terminado', 'nadie', null, null, null, '28 days',
   'Decisión firmada por Federico.'),
  ('BOB', '{}', 'handoff', 'Slice 1c – 4 archivos, esperar 77 tests', 'en_proceso', 'persona', 'henry', null, null, '25 days',
   E'## Instrucciones\n\n1. Aplicar los 4 archivos del paquete.\n2. Correr la suite: deben quedar 77 tests.\n\n## Report-back\n\n- [x] Archivos aplicados\n- [ ] 77 tests en verde\n- [ ] PR mergeado'),
  ('BOB', '{}', 'externo', 'Activar branch protection (5 jobs requeridos)', 'por_hacer', 'tercero', null, 'repo admin', null, '25 days',
   'Lo tiene que hacer quien administra el repo.'),
  ('BOB', '{}', 'externo', 'TTL de 13 meses – platform team', 'en_proceso', 'tercero', null, 'platform team', current_date + 3, '27 days',
   'TTL de 13 meses para business events. Lo confirma el platform team.'),
  ('BOB', '{}', 'pregunta', 'Slice 2: contrato de lectura del feeder (tablas, columnas, quién correlaciona)', 'por_hacer', 'persona', 'federico', null, null, '26 days',
   'Antes de empezar el slice 2 necesito el contrato de lectura del feeder.'),
  ('BOB', '{}', 'externo', 'Nombrar dueño del backup de configuración antes de aplicar en hosted', 'por_hacer', 'persona', 'federico', null, null, '25 days',
   'Hay que decidir quién es dueño del backup antes de aplicar en hosted.'),
  -- BzzzBX (BZX-1 … BZX-5)
  ('BZX', '{}', 'handoff', 'P1–P2: Box por cliente y runbook inicial', 'terminado', 'nadie', null, null, null, '30 days', 'Entregado.'),
  ('BZX', '{}', 'decision', 'Un Box por cliente, sin tenancy compartida', 'terminado', 'nadie', null, null, null, '29 days', 'Decisión firmada.'),
  ('BZX', '{}', 'handoff', 'Verification Pack de P3', 'terminado', 'nadie', null, null, null, '15 days', 'Verification Pack adjunto.'),
  ('BZX', '{}', 'pregunta', '¿El schema bzzz va en el mismo Postgres que la autenticación?', 'por_hacer', 'persona', 'henry', null, null, '12 days',
   'Necesito saber si el schema bzzz comparte Postgres con la autenticación.'),
  ('BZX', '{}', 'handoff', 'P5: schema bzzz y 3 roles con grants (aplicación, feeder, solo lectura)', 'en_proceso', 'persona', 'henry', null, current_date + 7, '12 days',
   E'## Instrucciones\n\nCrear el schema bzzz y los 3 roles con sus grants.\n\n## Report-back\n\n- [ ] Migración aplicada\n- [ ] Tests de grants'),
  -- Momentum (MOM-7 … MOM-9)
  ('MOM', '{}', 'handoff', 'Deploy del simulador en Vercel', 'terminado', 'nadie', null, null, null, '30 days', 'Desplegado (commit 0560ed5).'),
  ('MOM', '{}', 'pregunta', '¿El simulador usa la zona horaria del navegador o UTC?', 'terminado', 'nadie', null, null, null, '26 days', 'Respondida: UTC.'),
  ('MOM', '{}', 'decision', 'Residuo DST en toInstantMs: ¿aplicar iso + ''Z''?', 'por_hacer', 'persona', 'federico', null, null, '23 days',
   'Propuesta: normalizar con iso + ''Z''. Falta la firma de Federico.');

do $$
declare
  r record;
  henry uuid := '11111111-1111-4111-8111-111111111111';
  federico uuid := '22222222-2222-4222-8222-222222222222';
begin
  for r in select * from seed_tasks loop
    insert into public.tasks (
      project_id, number, key, aliases, type, title, body, status, turn, turn_user_id,
      turn_third_party, due_date, created_by, created_via, created_at, updated_at
    )
    select p.id, 0, '', r.aliases, r.type, r.title, r.body, r.status, r.turn,
           case r.who when 'henry' then henry when 'federico' then federico end,
           r.third, r.due, federico, 'web', now() - r.age, now() - r.age
    from public.projects p where p.key = r.project;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hilos, adjuntos y actividad de Git de ejemplo
-- ---------------------------------------------------------------------------
insert into public.replies (task_id, author_id, body, mark, via, created_at)
select t.id, case when g % 2 = 0 then '22222222-2222-4222-8222-222222222222'::uuid
                  else '11111111-1111-4111-8111-111111111111'::uuid end,
       case when g = 1 then 'Recibido, lo reviso.' else 'Seguimiento ' || g || '.' end,
       'normal', 'web', t.created_at + (g || ' hours')::interval
from public.tasks t
cross join lateral generate_series(1, case t.key
  when 'BOB-14' then 4 when 'BOB-12' then 5 when 'BOB-15' then 3 when 'BOB-16' then 2
  when 'BOB-18' then 2 when 'BOB-17' then 1 when 'BOB-10' then 2 when 'BOB-11' then 2
  when 'BOB-13' then 1 else 0 end) as g;

update public.replies set mark = 'firmada'
where task_id = (select id from public.tasks where key = 'BOB-13');

insert into public.attachments (task_id, storage_path, filename, size_bytes, md5, sha1, uploaded_by, via)
select t.id, p.id || '/' || t.id || '/' || gen_random_uuid() || '-' || f.name, f.name, f.size,
       md5(f.name), encode(extensions.digest(f.name, 'sha1'), 'hex'),
       '22222222-2222-4222-8222-222222222222', 'web'
from public.tasks t
join public.projects p on p.id = t.project_id
join (values ('BOB-14', 'slice-1c.zip', 48213), ('BOB-14', 'HANDOFF.md', 6120), ('BOB-14', 'tests.log', 2210),
             ('BOB-12', 'slice-1b.zip', 40122), ('BOB-12', 'HANDOFF.md', 5410),
             ('BOB-17', 'feeder-schema.sql', 3120)) as f(key, name, size) on f.key = t.key;

insert into public.git_events (delivery_id, project_id, owner, repo, kind, ref, sha, pr_number, title, state, url, payload, occurred_at)
values
  ('seed-1', 'aaaaaaaa-0000-4000-8000-00000000b0b0', 'BossTechnology', 'Bob-New', 'pull_request', 'bob-14-slice-1c', null, 23,
   'BOB-14 Slice 1c', 'open', 'https://github.com/BossTechnology/Bob-New/pull/23', '{}', now() - interval '2 hours'),
  ('seed-2', 'aaaaaaaa-0000-4000-8000-00000000b0b0', 'BossTechnology', 'Bob-New', 'check', 'bob-14-slice-1c', 'abc1234', 23,
   'CI', 'success', null, '{"passed": 5, "total": 5}', now() - interval '2 hours'),
  ('seed-3', 'aaaaaaaa-0000-4000-8000-00000000b0b0', 'BossTechnology', 'Bob-New', 'pull_request', 'bob-12-slice-1b', null, 21,
   'BOB-12 Slice 1b', 'merged', 'https://github.com/BossTechnology/Bob-New/pull/21', '{}', now() - interval '26 days'),
  ('seed-4', 'aaaaaaaa-0000-4000-8000-00000000b0b0', 'BossTechnology', 'Bob-New', 'check', 'bob-12-slice-1b', 'def5678', 21,
   'CI', 'success', null, '{"passed": 5, "total": 5}', now() - interval '26 days');

insert into public.task_git_links (task_id, git_event_id, matched_in)
select t.id, e.id, 'branch'
from public.git_events e
join public.tasks t on t.key = upper(split_part(e.ref, '-', 1)) || '-' || split_part(e.ref, '-', 2);
