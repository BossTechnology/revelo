-- Fase 1: login solo con invitación (PLAN.md §4 y §5).
--
--  * profiles: una fila por persona, creada por trigger cuando nace el usuario en auth.users
--    (al invitarlo), con nombre y rol tomados de los metadatos de la invitación.
--  * allowed_emails: lista de correos invitados. Solo la lee el hook de Auth.
--  * hook_before_user_created: Auth Hook "Before User Created". Rechaza cualquier correo
--    que no esté en allowed_emails. Es una defensa adicional al registro público apagado.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role text not null check (role in ('desarrollo', 'arquitectura', 'otro')),
  turn_color text not null default '#2E4FD0',
  created_at timestamptz not null default now()
);

create table public.allowed_emails (
  email extensions.citext primary key,
  invited_by uuid references public.profiles
);

comment on table public.allowed_emails is
  'Correos invitados. La única puerta de entrada: la lee el hook Before User Created.';

-- ---------------------------------------------------------------------------
-- Correos permitidos
-- ---------------------------------------------------------------------------

-- Normaliza mayúsculas y espacios. Un alias (+algo) es otra dirección: no se invitó, no entra.
create function public.is_allowed_email(email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.allowed_emails a
      where a.email = lower(btrim(is_allowed_email.email))::extensions.citext
    ),
    false
  );
$$;

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.is_allowed_email(event -> 'user' ->> 'email') then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Relevo es solo con invitación.'
    )
  );
end;
$$;

-- Solo Auth ejecuta el hook. Nadie desde la API puede preguntar si un correo está invitado.
revoke execute on function public.is_allowed_email(text) from public, anon, authenticated;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
-- El hook compara contra citext, que vive en el esquema extensions.
grant usage on schema extensions to supabase_auth_admin;
grant execute on function public.is_allowed_email(text) to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on table public.allowed_emails to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Perfil automático
-- ---------------------------------------------------------------------------

-- Los metadatos vienen de inviteUserByEmail (scripts/invite.ts). Si el rol no es válido,
-- queda 'otro'. Se ejecuta solo al crear el usuario: cambiar metadatos después no cambia el rol.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_role text := meta ->> 'role';
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(btrim(meta ->> 'display_name'), ''),
      nullif(btrim(meta ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    case when requested_role in ('desarrollo', 'arquitectura', 'otro') then requested_role else 'otro' end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;

-- Las personas con sesión se ven entre sí (hace falta para mostrar de quién es el turno).
-- En la Fase 2 se acota por proyecto compartido.
create policy "profiles: lectura con sesión"
  on public.profiles for select
  to authenticated
  using (true);

-- Cada quien edita su nombre y su color. El rol no: no tiene privilegio de columna.
create policy "profiles: cada quien edita su perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke update on table public.profiles from authenticated;
grant update (display_name, turn_color) on table public.profiles to authenticated;

-- allowed_emails: solo el hook de Auth la lee. anon y authenticated no tienen política
-- ni privilegios (Supabase se los da por defecto a las tablas nuevas de public).
revoke all on table public.allowed_emails from anon, authenticated;

create policy "allowed_emails: lectura del hook de Auth"
  on public.allowed_emails for select
  to supabase_auth_admin
  using (true);
