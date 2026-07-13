import { chromium, expect, test } from "@playwright/test";

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

test("initializes push and saves personalized companies", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("chrome-profile"),
    {
      channel: "chrome",
      headless: true,
    },
  );
  await context.grantPermissions(["notifications"], {
    origin: "https://arjunbojja1.github.io",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  await page.goto(`https://arjunbojja1.github.io/?e2e=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("#account-button")).toHaveText(/Guest|@/, {
    timeout: 20_000,
  });
  const notificationStatus = page.locator("#notification-status");
  await expect(notificationStatus).toHaveText(
    /Notifications are off|Push notifications are active/,
    { timeout: 20_000 },
  );

  await page.locator("#recommended-button").click();
  await expect(page.locator("#selection-count")).toHaveText("39 selected");
  await page.locator('input[name="track[]"][value="internship"]').check();
  await page.locator("#locations-input").fill("Bay Area, Remote");

  const enableButton = page.locator("#enable-button");
  if (await enableButton.isEnabled()) {
    await enableButton.click();
  }
  await expect(notificationStatus).toHaveText(
    "Push notifications are active on this device.",
    { timeout: 20_000 },
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        id: window.OneSignal?.User?.PushSubscription?.id,
        token: window.OneSignal?.User?.PushSubscription?.token,
      })),
    )
    .toMatchObject({
      id: expect.any(String),
      token: expect.stringContaining("https://fcm.googleapis.com/"),
    });

  await page.locator("#save-button").click();
  await expect(page.locator("#save-status")).toHaveText(
    "Preferences saved. Your alerts are active.",
    { timeout: 10_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#selection-count")).toHaveText("39 selected", {
    timeout: 20_000,
  });
  await expect(
    page.locator('input[name="track[]"][value="internship"]'),
  ).toBeChecked();
  await expect(page.locator("#locations-input")).toHaveValue(
    "Bay Area, Remote",
  );

  const registrationUrls = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.map((registration) => registration.active?.scriptURL);
  });
  expect(
    registrationUrls.some(
      (url) => new URL(url).pathname === "/OneSignalSDKWorker.js",
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await context.close();
});
