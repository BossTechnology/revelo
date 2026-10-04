import { expect, test } from "@playwright/test";

test("humo: la portada carga en español", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Relevo");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { level: 1, name: "Relevo" }),
  ).toBeVisible();
});
