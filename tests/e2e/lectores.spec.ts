import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { magicLinkTokenHash, signInFast } from "../support/auth";
import { mcpAccessToken, mcpClient, toolText } from "../support/mcp";
import { adminClient } from "../support/supabase";
import { addLector, createTeam, seedTask, type Team } from "../support/team";

/**
 * Fase 8 (docs/adr/0002): un lector ve todo su proyecto y no escribe nada, ni por la web, ni por
 * el MCP, ni contra la API de Supabase directamente.
 */

const panel = (page: Page) =>
  page.getByRole("complementary", { name: /Detalle de la tarea/ });

/** Un archivo ya subido y registrado (como el sistema), para que el lector lo descargue. */
async function seedAttachment(team: Team, taskId: string, filename: string) {
  const admin = adminClient();
  const path = `${team.projectId}/${taskId}/${randomUUID()}-${filename}`;
  const content = Buffer.from(`contenido de ${filename}\n`);
  const { error: upError } = await admin.storage
    .from("attachments")
    .upload(path, content);
  if (upError) throw upError;
  const { data, error } = await admin
    .from("attachments")
    .insert({
      task_id: taskId,
      storage_path: path,
      filename,
      size_bytes: content.byteLength,
      uploaded_by: team.a.id,
      via: "web",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, path };
}

/** Cliente de Supabase con la sesión propia de `email`, sin pasar por la web. */
async function apiAs(email: string) {
  const api = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await api.auth.verifyOtp({
    type: "magiclink",
    token_hash: await magicLinkTokenHash(email),
  });
  if (error) throw error;
  return api;
}

test("web: el lector ve el proyecto sin controles de escritura y descarga adjuntos", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Avance para el cliente",
    turnUserId: team.a.id,
  });
  await seedAttachment(team, task.id, "avance.txt");
  const lector = await addLector(team);

  await signInFast(page, lector.email);
  await expect(
    page.getByRole("button", { name: "Nuevo proyecto" }),
  ).toHaveCount(0);

  await page.goto(`/p/${team.key}`);
  await expect(page.getByText("Solo lectura")).toBeVisible();
  await expect(
    page.getByRole("article", { name: new RegExp(`${task.key}:`) }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva tarea" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: `Mover ${task.key}` }),
  ).toHaveCount(0);

  await page.goto(`/p/${team.key}/t/${task.key}`);
  await expect(panel(page)).toContainText("Avance para el cliente");
  for (const name of ["Editar título", "Editar instrucciones", "Responder"]) {
    await expect(panel(page).getByRole("button", { name })).toHaveCount(0);
  }
  await expect(panel(page).getByText("Adjuntar archivo")).toHaveCount(0);
  await expect(panel(page).getByRole("combobox")).toHaveCount(0);
  await expect(panel(page).getByText("Por hacer")).toBeVisible();

  const download = page.waitForEvent("download");
  await panel(page)
    .getByRole("button", { name: "Descargar avance.txt" })
    .click();
  expect((await download).suggestedFilename()).toBe("avance.txt");
});

test("web: el lector ve los miembros con su acceso y se sale del proyecto", async ({
  page,
}) => {
  const team = await createTeam();
  const lector = await addLector(team);
  await signInFast(page, lector.email, `/ajustes/proyecto/${team.key}`);

  const members = page.getByRole("list", { name: "Miembros del proyecto" });
  await expect(
    members.getByRole("listitem", { name: team.a.name }),
  ).toContainText("Editor");
  await expect(
    members.getByRole("listitem", { name: lector.name }),
  ).toContainText("Lector");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Quitar a/ })).toHaveCount(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Salir del proyecto" }).click();
  await expect(page).toHaveURL("/");
  expect((await page.goto(`/p/${team.key}`))?.status()).toBe(404);
});

test("web: un editor cambia accesos, el turno solo se ofrece a editores y no se baja a quien tiene el turno", async ({
  page,
}) => {
  const team = await createTeam();
  const lector = await addLector(team);
  const task = await seedTask(team, {
    title: "En el turno de b",
    turnUserId: team.b.id,
  });

  await signInFast(page, team.a.email, `/p/${team.key}/t/${task.key}`);
  const turn = panel(page).getByLabel("Turno");
  await expect(turn.locator("option", { hasText: team.b.name })).toHaveCount(1);
  await expect(turn.locator("option", { hasText: lector.name })).toHaveCount(0);

  await page.goto(`/ajustes/proyecto/${team.key}`);
  await page.getByLabel(`Acceso de ${team.b.name}`).selectOption("lector");
  await expect(
    page.getByText(/tiene tareas abiertas en su turno/),
  ).toContainText(task.key);
  // El cambio rechazado no se queda en pantalla.
  await expect(page.getByLabel(`Acceso de ${team.b.name}`)).toHaveValue(
    "editor",
  );

  await page.getByLabel(`Acceso de ${lector.name}`).selectOption("editor");
  await expect(page.getByText("Acceso actualizado")).toBeVisible();

  const { data } = await adminClient()
    .from("project_members")
    .select("user_id, acceso")
    .eq("project_id", team.projectId);
  expect(
    Object.fromEntries((data ?? []).map((m) => [m.user_id, m.acceso])),
  ).toEqual({
    [team.a.id]: "editor",
    [team.b.id]: "editor",
    [lector.id]: "editor",
  });
});

test("web: nuevo proyecto con Editor o Lector para cada persona", async ({
  page,
}) => {
  const team = await createTeam();
  const lector = await addLector(team);
  const key = `Z${team.key.slice(1)}`;
  await signInFast(page, team.a.email);

  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill(`Nuevo ${key}`);
  await dialog.getByLabel("Prefijo").fill(key);
  await dialog.getByLabel("Empresa").fill(team.company);
  await dialog.getByRole("checkbox", { name: team.b.name }).check();
  await dialog.getByLabel(`Acceso de ${team.b.name}`).selectOption("editor");
  await dialog.getByRole("checkbox", { name: lector.name }).check();
  await expect(dialog.getByLabel(`Acceso de ${lector.name}`)).toHaveValue(
    "lector",
  );
  await dialog.getByRole("button", { name: "Crear proyecto" }).click();
  // En `next dev` la primera visita a /p/[key] compila la ruta.
  await expect(page).toHaveURL(`/p/${key}`, { timeout: 15_000 });

  const admin = adminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("key", key)
    .single();
  const { data } = await admin
    .from("project_members")
    .select("user_id, acceso")
    .eq("project_id", project!.id);
  expect(
    Object.fromEntries((data ?? []).map((m) => [m.user_id, m.acceso])),
  ).toEqual({
    [team.a.id]: "editor",
    [team.b.id]: "editor",
    [lector.id]: "lector",
  });
});

test("API de Supabase directa: cada escritura del lector falla", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Intocable",
    turnUserId: team.a.id,
  });
  const file = await seedAttachment(team, task.id, "base.txt");
  const lector = await addLector(team);
  const api = await apiAs(lector.email);

  const { data: visible } = await api.from("tasks").select("key");
  expect(visible).toEqual([{ key: task.key }]);

  const { error: insertError } = await api.from("tasks").insert({
    project_id: team.projectId,
    number: 0,
    key: "",
    type: "pregunta",
    title: "Del lector",
    turn: "tercero",
    turn_third_party: "x",
    created_by: lector.id,
    created_via: "web",
  });
  expect(insertError?.code).toBe("42501");
  const { data: updated } = await api
    .from("tasks")
    .update({ title: "Del lector", status: "en_proceso" })
    .eq("id", task.id)
    .select("id");
  expect(updated).toEqual([]);
  const { error: replyError } = await api.from("replies").insert({
    task_id: task.id,
    body: "Del lector",
    author_id: lector.id,
    via: "web",
  });
  expect(replyError?.code).toBe("42501");
  const { error: uploadError } = await api.storage
    .from("attachments")
    .upload(`${team.projectId}/${task.id}/${randomUUID()}-x.txt`, "x");
  expect(uploadError).not.toBeNull();
  const { data: promoted } = await api
    .from("project_members")
    .update({ acceso: "editor" })
    .eq("user_id", lector.id)
    .select("user_id");
  expect(promoted).toEqual([]);

  // finalize con la sesión web del lector: la escritura con su token falla antes de que el
  // servidor use la secret key para los hashes.
  await signInFast(page, lector.email, `/p/${team.key}`);
  const res = await page.request.post("/api/attachments/finalize", {
    data: { taskId: task.id, path: file.path, filename: "copia.txt" },
  });
  expect(res.status()).toBe(400);

  const admin = adminClient();
  const { data: atts } = await admin
    .from("attachments")
    .select("filename")
    .eq("task_id", task.id);
  expect(atts).toEqual([{ filename: "base.txt" }]);
  const { data: after } = await admin
    .from("tasks")
    .select("title, status")
    .eq("id", task.id)
    .single();
  expect(after).toEqual({ title: "Intocable", status: "por_hacer" });
});

test("MCP: el lector lee y cada escritura responde que su acceso es de solo lectura", async ({
  baseURL,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Para leer por MCP",
    turnUserId: team.a.id,
  });
  const file = await seedAttachment(team, task.id, "leer.txt");
  const lector = await addLector(team);
  const { accessToken } = await mcpAccessToken(lector.email);
  const mcp = await mcpClient(baseURL!, accessToken);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await mcp.callTool({ name, arguments: args });
    return { text: toolText(r), isError: r.isError === true };
  };

  expect(
    (await call("resumen_proyecto", { proyecto: team.key })).text,
  ).toContain(`(${team.key})`);
  expect((await call("ver_board", { proyecto: team.key })).text).toContain(
    task.key,
  );
  expect((await call("ver_tarea", { id: task.key })).text).toContain(
    `# ${task.key}`,
  );
  expect((await call("descargar_adjunto", { id: file.id })).text).toMatch(
    /URL \(vence en 5 minutos\): http/,
  );

  for (const [name, args] of [
    [
      "crear_tarea",
      { proyecto: team.key, tipo: "pregunta", titulo: "x", turno: "yo" },
    ],
    ["responder", { id: task.key, texto: "Del lector" }],
    [
      "adjuntar",
      {
        id: task.key,
        nombre: "lector.txt",
        contenido_base64: Buffer.from("x").toString("base64"),
      },
    ],
    ["cambiar_estado", { id: task.key, estado: "en_proceso" }],
    ["pasar_turno", { id: task.key, a: "yo" }],
  ] as const) {
    const r = await call(name, args);
    expect(r.isError, name).toBe(true);
    expect(r.text, name).toBe(`Tu acceso a ${team.key} es de solo lectura.`);
  }
  await mcp.close();

  // Nada cambió: ni filas ni archivos en Storage.
  const admin = adminClient();
  const { data: tasks } = await admin
    .from("tasks")
    .select("key, status, turn_user_id")
    .eq("project_id", team.projectId);
  expect(tasks).toEqual([
    { key: task.key, status: "por_hacer", turn_user_id: team.a.id },
  ]);
  const { count: replies } = await admin
    .from("replies")
    .select("id", { count: "exact", head: true })
    .eq("task_id", task.id);
  expect(replies).toBe(0);
  const { data: files } = await admin.storage
    .from("attachments")
    .list(`${team.projectId}/${task.id}`);
  expect((files ?? []).map((f) => f.name)).toEqual([
    file.path.split("/").at(-1),
  ]);

  // Un editor tampoco le puede pasar el turno a un lector por el MCP.
  const editor = await mcpClient(
    baseURL!,
    (await mcpAccessToken(team.a.email)).accessToken,
  );
  const pass = await editor.callTool({
    name: "pasar_turno",
    arguments: { id: task.key, a: lector.name },
  });
  expect(pass.isError).toBe(true);
  expect(toolText(pass)).toContain("solo lectura: no puede tener el turno");
  await editor.close();
});

test("web: si a alguien lo bajan a lector con la página abierta, sus cambios no se pierden en silencio", async ({
  page,
}) => {
  const team = await createTeam();
  const task = await seedTask(team, {
    title: "Se mueve sin permiso",
    turnUserId: team.a.id,
  });
  await signInFast(page, team.b.email, `/p/${team.key}/t/${task.key}`);
  const status = panel(page).getByLabel("Estado");
  await expect(status).toBeVisible();

  // Un editor lo baja a lector mientras b tiene el detalle abierto.
  const admin = adminClient();
  const { error } = await admin
    .from("project_members")
    .update({ acceso: "lector" })
    .eq("project_id", team.projectId)
    .eq("user_id", team.b.id);
  expect(error).toBeNull();

  await status.selectOption("en_proceso");
  await expect(
    page.getByText(`Tu acceso a ${team.key} es de solo lectura.`),
  ).toBeVisible();
  const { data } = await admin
    .from("tasks")
    .select("status")
    .eq("id", task.id)
    .single();
  expect(data?.status).toBe("por_hacer");
});
