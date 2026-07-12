import { expect, test } from "@playwright/test";

test("loads the installable PWA assets", async ({ request }) => {
  const manifest = await request.get("manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  await expect(manifest.json()).resolves.toMatchObject({
    display: "standalone",
    start_url: "/",
    scope: "/",
  });

  const worker = await request.get("OneSignalSDKWorker.js");
  expect(worker.ok()).toBeTruthy();
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  expect(await worker.text()).toContain("OneSignalSDK.sw.js");
});

test("initializes push and saves personalized companies", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  await page.goto(`?e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });

  const notificationStatus = page.locator("#notification-status");
  await expect(notificationStatus).toHaveText(
    /Notifications are off|Push notifications are active/,
    { timeout: 20_000 },
  );

  await page.locator("#recommended-button").click();
  await expect(page.locator("#selection-count")).toHaveText("39 selected");

  const enableButton = page.locator("#enable-button");
  if (await enableButton.isEnabled()) {
    await enableButton.click();
  }
  await expect(notificationStatus).toHaveText(
    "Push notifications are active on this device.",
    { timeout: 20_000 },
  );

  await page.locator("#save-button").click();
  await expect(page.locator("#save-status")).toHaveText(
    "Preferences saved. Your alerts are active.",
    { timeout: 10_000 },
  );

  const registrationUrls = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.map((registration) => registration.active?.scriptURL);
  });
  expect(registrationUrls).toContain(
    "https://arjunbojja1.github.io/OneSignalSDKWorker.js",
  );
  expect(errors).toEqual([]);
});
