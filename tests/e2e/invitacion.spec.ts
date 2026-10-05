import { expect, test } from "@playwright/test";

import { adminClient, testEmail, userExists } from "../support/supabase";

/**
 * El hook "Before User Created" pasando por Auth de verdad (inviteUserByEmail, como hace
 * scripts/invite.mts). pgTAP prueba la función, pero no puede ejecutarla con el rol de Auth:
 * aquí se distingue un rechazo del hook (403) de un hook que falla (500).
 */
test.describe("invitación y hook Before User Created", () => {
  test("un correo en allowed_emails se puede invitar y queda con su perfil", async () => {
    const admin = adminClient();
    const email = testEmail("invitada");
    await admin.from("allowed_emails").insert({ email });

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: "Invitada E2E", role: "arquitectura" },
    });
    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, role")
      .eq("id", data.user!.id)
      .single();
    expect(profile).toEqual({
      display_name: "Invitada E2E",
      role: "arquitectura",
    });
  });

  test("un correo fuera de allowed_emails lo rechaza el hook (403, no un error)", async () => {
    const admin = adminClient();
    const email = testEmail("colado");

    const { error } = await admin.auth.admin.inviteUserByEmail(email);
    expect(error?.status).toBe(403);
    expect(error?.message).toContain("solo con invitación");
    expect(await userExists(email)).toBe(false);
  });
});
