import { adminClient, createInvitedUser, testEmail } from "./supabase";

export type Team = {
  projectId: string;
  key: string;
  a: { id: string; email: string; name: string };
  b: { id: string; email: string; name: string };
};

function randomKey() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(
    { length: 5 },
    () => letters[Math.floor(Math.random() * 26)],
  ).join("");
}

/**
 * Dos personas invitadas y un proyecto propio para el test: así los tests corren en paralelo
 * sin pisarse (cada uno con su prefijo y sus usuarios).
 */
export async function createTeam(): Promise<Team> {
  const admin = adminClient();
  const a = {
    email: testEmail("henry"),
    name: `Henry ${Math.random().toString(36).slice(2, 6)}`,
  };
  const b = {
    email: testEmail("federico"),
    name: `Federico ${Math.random().toString(36).slice(2, 6)}`,
  };
  await createInvitedUser(a.email, a.name);
  await createInvitedUser(b.email, b.name);

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("display_name", [a.name, b.name]);
  if (pErr) throw pErr;
  const idOf = (name: string) =>
    profiles!.find((p) => p.display_name === name)!.id;

  const key = randomKey();
  const { data: project, error } = await admin
    .from("projects")
    .insert({ name: `Proyecto ${key}`, key, color: "#3442C4" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: mErr } = await admin.from("project_members").insert([
    { project_id: project.id, user_id: idOf(a.name) },
    { project_id: project.id, user_id: idOf(b.name) },
  ]);
  if (mErr) throw mErr;

  return {
    projectId: project.id,
    key,
    a: { id: idOf(a.name), ...a },
    b: { id: idOf(b.name), ...b },
  };
}

/** Crea una tarea directamente (como el sistema), para preparar un escenario. */
export async function seedTask(
  team: Team,
  fields: {
    title: string;
    turnUserId: string;
    type?: "handoff" | "pregunta" | "decision" | "externo";
  },
) {
  const { data, error } = await adminClient()
    .from("tasks")
    .insert({
      project_id: team.projectId,
      number: 0,
      key: "",
      type: fields.type ?? "handoff",
      title: fields.title,
      turn: "persona",
      turn_user_id: fields.turnUserId,
      created_by: team.b.id,
      created_via: "web",
    })
    .select("id, key")
    .single();
  if (error) throw error;
  return data;
}
