import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("can reopen the app and browse cached drama data offline after the first visit", async ({ page, context }) => {
  await page.goto("./");
  await expect(page.locator(".show-card").first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".show-card").first()).toBeVisible();
  await expect(page.locator("#offline-note")).toBeVisible();
  await expect(page.locator("#error-state")).toBeHidden();
  await page.getByRole("button", { name: /J-drama/ }).click();
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await expect(page.locator(".show-card").first()).toBeVisible();
});
