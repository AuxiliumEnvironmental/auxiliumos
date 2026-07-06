import { expect, test } from "@playwright/test";

declare const process: {
  cwd: () => string;
};

const appUrl = encodeURI(`file://${process.cwd()}/app/index.html`);

test.describe("AuxiliumOS static app shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(appUrl);
  });

  test("loads the prototype shell with guardrails", async ({ page }) => {
    await expect(page.getByText(/Prototype only/i)).toBeVisible();
    await expect(page.getByText(/demo data, no backend, no PHI, no real client data/i)).toBeVisible();

    await expect(
      page
        .locator(".guardrail-card")
        .getByText("No client-visible document without release workflow.", { exact: true }),
    ).toBeVisible();

    await expect(
      page.locator(".guardrail-card").getByText("No chat/message changes approved scope.", { exact: true }),
    ).toBeVisible();

    await expect(
      page.locator(".guardrail-card").getByText("No client-data table without RLS plan and tests.", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("switches between the three static portal views", async ({ page }) => {
    await expect(page.locator("[data-testid='view-title']")).toContainText("Simple Project Portal");

    await page.getByRole("button", { name: "Enterprise Facility Portal" }).click();
    await expect(page.locator("[data-testid='view-title']")).toContainText("Enterprise Facility Portal");
    await expect(page.getByText("North Wing Facility", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Internal Admin Command Center" }).click();
    await expect(page.locator("[data-testid='view-title']")).toContainText("Internal Admin Command Center");
    await expect(page.getByText("Intake Queue Demo", { exact: true })).toBeVisible();
  });

  test("shows document placeholders without release authority", async ({ page }) => {
    await page.getByRole("button", { name: "Documents" }).click();

    await expect(page.locator("[data-testid='section-title']")).toContainText("Documents");
    await expect(page.getByText("Document Placeholder 001", { exact: true })).toBeVisible();

    await expect(
      page
        .locator(".guardrail-card")
        .getByText("No client-visible document without release workflow.", { exact: true }),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: /Placeholder only/i })).toBeDisabled();
  });
});