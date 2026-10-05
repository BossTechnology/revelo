-- Fase 4: MCP.
--  * Límite de 60 llamadas por minuto por persona (PLAN.md §7). Vive en Postgres para que valga
--    entre instancias serverless. mcp_hit() lo consulta y lo incrementa en una sola operación.

create table public.mcp_rate_limits (
  user_id uuid not null references public.profiles on delete cascade,
  window_start timestamptz not null,
  calls int not null default 0,
  primary key (user_id, window_start)
);

alter table public.mcp_rate_limits enable row level security;

-- Cada quien ve su propio contador (útil para /ajustes/conexiones). Escribe solo mcp_hit().
create policy "mcp_rate_limits: cada quien ve lo suyo" on public.mcp_rate_limits
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.mcp_rate_limits from anon, authenticated;

create function public.mcp_hit(max_calls int default 60)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  current_window timestamptz := date_trunc('minute', now());
  used int;
begin
  if me is null then
    return false;
  end if;
  insert into public.mcp_rate_limits (user_id, window_start, calls)
  values (me, current_window, 1)
  on conflict (user_id, window_start) do update set calls = public.mcp_rate_limits.calls + 1
  returning calls into used;
  -- Limpieza oportunista de ventanas viejas de esta persona.
  delete from public.mcp_rate_limits where user_id = me and window_start < current_window - interval '1 hour';
  return used <= max_calls;
end;
$$;

revoke execute on function public.mcp_hit(int) from public, anon;
grant execute on function public.mcp_hit(int) to authenticated;
