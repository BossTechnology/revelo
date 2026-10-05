-- Fase 1: invitación, hook "Before User Created", perfil automático y RLS de login.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- Datos
-- ---------------------------------------------------------------------------
insert into public.allowed_emails (email) values ('henry@boss.technology');

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', 'f@boss.technology', 'authenticated', 'authenticated',
   '{"display_name": "Federico", "role": "arquitectura"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'otra@boss.technology', 'authenticated', 'authenticated',
   '{"role": "admin"}');

-- ---------------------------------------------------------------------------
-- RLS activado
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles tiene RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.allowed_emails'::regclass),
  'allowed_emails tiene RLS');

-- ---------------------------------------------------------------------------
-- is_allowed_email: normaliza mayúsculas y espacios, rechaza alias
-- ---------------------------------------------------------------------------
select ok(public.is_allowed_email('henry@boss.technology'), 'correo invitado exacto: entra');
select ok(public.is_allowed_email('HENRY@Boss.Technology'), 'mayúsculas: entra');
select ok(public.is_allowed_email('  henry@boss.technology  '), 'espacios alrededor: entra');
select ok(not public.is_allowed_email('henry+algo@boss.technology'), 'alias +algo: no entra');
select ok(not public.is_allowed_email('otro@boss.technology'), 'correo no invitado: no entra');
select ok(not public.is_allowed_email(null), 'correo nulo: no entra');
select ok(not public.is_allowed_email(''), 'correo vacío: no entra');

-- ---------------------------------------------------------------------------
-- Hook Before User Created
-- ---------------------------------------------------------------------------
select is(
  public.hook_before_user_created('{"user": {"email": " Henry@boss.technology"}}'),
  '{}'::jsonb,
  'hook: invitado devuelve {} (se crea el usuario)'
);
select is(
  public.hook_before_user_created('{"user": {"email": "intruso@gmail.com"}}') -> 'error' ->> 'http_code',
  '403',
  'hook: no invitado devuelve error 403'
);
select is(
  public.hook_before_user_created('{"user": {"email": "henry+x@boss.technology"}}') -> 'error' ->> 'http_code',
  '403',
  'hook: alias de un invitado devuelve error 403'
);
select is(
  public.hook_before_user_created('{"user": {}}') -> 'error' ->> 'http_code',
  '403',
  'hook: sin correo devuelve error 403'
);

-- ---------------------------------------------------------------------------
-- Privilegios: solo Auth ejecuta el hook y lee allowed_emails
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.is_allowed_email(text)', 'execute'),
  'anon no puede preguntar si un correo está invitado');
select ok(not has_function_privilege('authenticated', 'public.is_allowed_email(text)', 'execute'),
  'authenticated no puede preguntar si un correo está invitado');
select ok(not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute'),
  'anon no puede ejecutar el hook');
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'),
  'supabase_auth_admin puede ejecutar el hook');

-- postgres no puede asumir supabase_auth_admin en local, así que se verifican las dos piezas
-- que el hook necesita con ese rol: privilegio de lectura y política RLS que lo deje pasar.
select ok(
  has_table_privilege('supabase_auth_admin', 'public.allowed_emails', 'select')
  and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'allowed_emails'
      and cmd = 'SELECT' and 'supabase_auth_admin' = any (roles)
  ),
  'supabase_auth_admin puede leer allowed_emails (privilegio + política)'
);

set local role authenticated;
select throws_ok(
  'select count(*) from public.allowed_emails',
  '42501',
  null,
  'authenticated no puede leer allowed_emails'
);
reset role;

-- ---------------------------------------------------------------------------
-- Perfil automático al crear el usuario
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select display_name, role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('Federico'::text, 'arquitectura'::text) $$,
  'el perfil toma nombre y rol de la invitación'
);
select results_eq(
  $$ select display_name, role from public.profiles where id = '00000000-0000-0000-0000-0000000000a2' $$,
  $$ values ('otra'::text, 'otro'::text) $$,
  'rol inválido queda en otro; sin nombre usa la parte local del correo'
);

-- ---------------------------------------------------------------------------
-- RLS de profiles
-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*) from public.profiles), 0::bigint, 'anon no ve perfiles');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

select is((select count(*) from public.profiles), 2::bigint, 'con sesión se ven los perfiles');

update public.profiles set display_name = 'Fede' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Hackeado' where id = '00000000-0000-0000-0000-0000000000a2';

select throws_ok(
  $$ update public.profiles set role = 'desarrollo' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501',
  null,
  'nadie cambia su propio rol'
);
reset role;

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Fede',
  'cada quien edita su nombre'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  'otra',
  'nadie edita el perfil de otra persona'
);

select * from finish();
rollback;
