import { expect, test } from "@playwright/test";

import { adminClient } from "../support/supabase";

/**
 * PLAN.md §10.2: dos inserts concurrentes en el mismo proyecto obtienen números distintos y
 * consecutivos. pgTAP corre en una sola transacción, así que la concurrencia real se prueba aquí,
 * con conexiones paralelas contra el stack local.
 */
test("numeración: inserts concurrentes reciben números distintos y consecutivos", async () => {
  const admin = adminClient();
  const key = `N${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()
    .replace(/[^A-Z]/g, "X")}`;
  const { data: project, error } = await admin
    .from("projects")
    .insert({ name: `Concurrencia ${key}`, key, color: "#000000" })
    .select("id")
    .single();
  expect(error).toBeNull();

  const { data: creator } = await admin
    .from("profiles")
    .select("id")
    .limit(1)
    .single();
  const inserts = Array.from({ length: 20 }, (_, i) =>
    admin
      .from("tasks")
      .insert({
        project_id: project!.id,
        number: 0,
        key: "",
        type: "pregunta",
        title: `Concurrente ${i}`,
        turn: "tercero",
        turn_third_party: "test",
        created_by: creator!.id,
        created_via: "web",
      })
      .select("number, key")
      .single(),
  );
  const results = await Promise.all(inserts);

  expect(results.map((r) => r.error)).toEqual(Array(20).fill(null));
  const numbers = results.map((r) => r.data!.number).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(new Set(results.map((r) => r.data!.key)).size).toBe(20);
});
