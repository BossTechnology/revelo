import { expect, test } from "@playwright/test";

test("humo: la pantalla de entrada carga en español", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Entrar · Relevo");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { level: 1, name: "Entrar a Relevo" }),
  ).toBeVisible();
});
