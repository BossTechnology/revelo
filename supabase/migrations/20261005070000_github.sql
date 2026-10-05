-- Fase 5: GitHub.
--  * Vincular actividad de Git a una tarea queda en su historial (via = github).
--  * Ajustes del proyecto: los miembros conectan y desconectan repos, agregan miembros y cambian
--    nombre y color. El prefijo no cambia (formaría IDs nuevos para tareas ya creadas).

create function public.log_git_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.git_events;
begin
  select * into e from public.git_events where id = new.git_event_id;
  insert into public.task_events (task_id, actor_id, via, kind, to_value)
  values (
    new.task_id,
    null,
    'github',
    'git_vinculado',
    case e.kind
      when 'pull_request' then 'PR #' || e.pr_number || ' ' || coalesce(e.state, '')
      when 'check' then 'CI ' || coalesce(e.state, '') || coalesce(' en ' || e.ref, '')
      else coalesce(e.ref, '') || coalesce(' · ' || e.title, '')
    end
  );
  return null;
end;
$$;

revoke execute on function public.log_git_link() from public, anon, authenticated;

create trigger task_git_links_log after insert on public.task_git_links
  for each row execute function public.log_git_link();

-- Repos: los miembros conectan y desconectan repos de su proyecto.
grant insert, delete on public.project_repos to authenticated;
create policy "project_repos: miembros conectan" on public.project_repos
  for insert to authenticated with check (public.is_member(project_id));
create policy "project_repos: miembros desconectan" on public.project_repos
  for delete to authenticated using (public.is_member(project_id));

-- Miembros: un miembro puede sumar a otra persona invitada (no puede sumarse a sí mismo a un
-- proyecto ajeno: la política exige ser ya miembro).
grant insert on public.project_members to authenticated;
create policy "project_members: miembros suman personas" on public.project_members
  for insert to authenticated with check (public.is_member(project_id));

-- Proyecto: nombre, color y archivar. El prefijo (key) no, por privilegio de columna.
grant update (name, color, archived_at) on public.projects to authenticated;
create policy "projects: miembros editan" on public.projects
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
