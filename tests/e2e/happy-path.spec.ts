import { expect, test } from "@playwright/test";

/**
 * The mandated happy-path E2E, run against the deployed app on real Aurora DSQL: cross-region
 * consent revoke and grant, a cap-deny gate, the tamper-evident ledger verifying intact, and the
 * SD-JWT age proof. Serialized and state-restoring (consent is granted back at the end), so it is
 * safe to run against the live demo. Set BASE_URL to target a different deployment.
 */
test.describe.configure({ mode: "serial" });

const T = 30_000;

test("cross-region consent, cap deny, ledger verify, age proof", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /consistency control room/i })).toBeVisible({
    timeout: T,
  });

  // Revoke consent. The action commits to Region A and both region panels reflect REVOKED.
  await page.getByRole("button", { name: "revoke", exact: true }).click();
  await expect(page.getByText("revoke: committed")).toBeVisible({ timeout: T });
  await expect(page.getByText("REVOKED").first()).toBeVisible({ timeout: T });

  // Grant consent back, restoring the demo state, and confirm both regions read GRANTED.
  await page.getByRole("button", { name: "grant consent", exact: true }).click();
  await expect(page.getByText("grant: committed")).toBeVisible({ timeout: T });
  await expect(page.getByText("GRANTED").first()).toBeVisible({ timeout: T });

  // The tamper-evident ledger verifies intact against the live chain.
  await page.getByRole("button", { name: "verify chain", exact: true }).click();
  await expect(page.getByText(/chain intact/i)).toBeVisible({ timeout: T });

  // The platform gate declines a spend over the cap.
  await page.getByRole("button", { name: "authorize $18 spend", exact: true }).click();
  await expect(page.getByText("DENY").first()).toBeVisible({ timeout: T });

  // The SD-JWT proof discloses the bracket and withholds the date of birth.
  await page.getByRole("button", { name: "prove age bracket", exact: true }).click();
  await expect(page.getByText("withheld")).toBeVisible({ timeout: T });
  await expect(page.getByText("13-15").first()).toBeVisible({ timeout: T });
});
