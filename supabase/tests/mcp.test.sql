-- Fase 4: límite de 60 llamadas por minuto por persona al MCP.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('0000000d-0000-4000-8000-000000000001', 'ia@test.local', 'authenticated', 'authenticated', '{"display_name": "IA"}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "0000000d-0000-4000-8000-000000000001", "role": "authenticated", "client_id": "claude"}';

select ok(
  (select bool_and(public.mcp_hit()) from generate_series(1, 60)),
  'las primeras 60 llamadas del minuto pasan'
);
select is(public.mcp_hit(), false, 'la llamada 61 se rechaza');
select throws_ok(
  $$ insert into public.mcp_rate_limits (user_id, window_start, calls)
     values ('0000000d-0000-4000-8000-000000000001', now(), 0) $$,
  '42501', null, 'nadie reinicia su contador a mano'
);
reset role;

select throws_ok(
  $$ set local role anon; select public.mcp_hit() $$,
  '42501', null, 'sin sesión (anon) no se puede llamar'
);
reset role;

select * from finish();
rollback;
