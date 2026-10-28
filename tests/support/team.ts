import { adminClient, createInvitedUser, testEmail } from "./supabase";

export type Team = {
  projectId: string;
  key: string;
  company: string;
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

/** Una empresa propia para el test (Fase 7): todo proyecto pertenece a una. */
export async function createCompany(name: string) {
  const { data, error } = await adminClient()
    .from("companies")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
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
  const company = `Empresa ${key}`;
  const companyId = await createCompany(company);
  const { data: project, error } = await admin
    .from("projects")
    .insert({
      name: `Proyecto ${key}`,
      key,
      color: "#3442C4",
      company_id: companyId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: mErr } = await admin.from("project_members").insert([
    { project_id: project.id, user_id: idOf(a.name), acceso: "editor" },
    { project_id: project.id, user_id: idOf(b.name), acceso: "editor" },
  ]);
  if (mErr) throw mErr;

  return {
    projectId: project.id,
    key,
    company,
    a: { id: idOf(a.name), ...a },
    b: { id: idOf(b.name), ...b },
  };
}

/**
 * Suma al proyecto del equipo a una persona invitada con acceso de lector (Fase 8): alguien de
 * afuera que solo ve.
 */
export async function addLector(team: Team) {
  const admin = adminClient();
  const lector = {
    email: testEmail("lector"),
    name: `Lector ${Math.random().toString(36).slice(2, 6)}`,
  };
  await createInvitedUser(lector.email, lector.name);
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id")
    .eq("display_name", lector.name)
    .single();
  if (pErr) throw pErr;
  const { error } = await admin.from("project_members").insert({
    project_id: team.projectId,
    user_id: profile.id,
    acceso: "lector",
  });
  if (error) throw error;
  return { id: profile.id, ...lector };
}

/** Crea una tarea directamente (como el sistema), para preparar un escenario. */
export async function seedTask(
  team: Team,
  fields: {
    title: string;
    turnUserId: string;
    type?: "handoff" | "pregunta" | "decision" | "externo";
    categoryId?: string;
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
      category_id: fields.categoryId ?? null,
    })
    .select("id, key")
    .single();
  if (error) throw error;
  return data;
}
