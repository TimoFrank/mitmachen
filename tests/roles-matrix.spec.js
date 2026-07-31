import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/app-test-session.js";

const allowedByRole = {
  admin: 9,
  editor: 5,
  viewer: 2
};

for (const [role, allowedCount] of Object.entries(allowedByRole)) {
  test(`Rollenmatrix zeigt die Standardrechte für ${role}`, async ({ page }) => {
    await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#profile", { role });

    const matrix = page.locator(".role-matrix-workspace");
    await expect(matrix).toBeVisible();
    await expect(page.locator("#role-matrix-body tr")).toHaveCount(9);
    await expect(page.locator("#role-matrix-role-overview .role-matrix-role-summary")).toHaveCount(3);
    await expect(page.locator(`[data-role-matrix-role-card="${role}"]`)).toHaveClass(/is-current-role/);
    await expect(page.locator(`[data-role-matrix-heading="${role}"]`)).toHaveAttribute("aria-current", "true");
    await expect(page.locator(`#role-matrix-body [data-role-matrix-role="${role}"].is-allowed`)).toHaveCount(allowedCount);
    await expect(page.locator(`#role-matrix-body [data-role-matrix-role="${role}"].is-unavailable`)).toHaveCount(9 - allowedCount);
    await expect(matrix).toContainText("Rollen werden über einen geschützten Betriebsprozess vergeben");
  });
}
