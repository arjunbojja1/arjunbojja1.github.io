# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa.spec.mjs >> initializes push and saves personalized companies
- Location: tests/pwa.spec.mjs:18:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('#notification-status')
Expected pattern: /Notifications are off|Push notifications are active/
Received string:  "Push notifications could not be initialized."
Timeout: 20000ms

Call log:
  - Expect "toHaveText" with timeout 20000ms
  - waiting for locator('#notification-status')
    5 × locator resolved to <p class="muted" aria-live="polite" id="notification-status">Connecting to the push service...</p>
      - unexpected value "Connecting to the push service..."
    39 × locator resolved to <p class="muted" aria-live="polite" id="notification-status">Push notifications could not be initialized.</p>
       - unexpected value "Push notifications could not be initialized."

```

```yaml
- paragraph: Push notifications could not be initialized.
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("loads the installable PWA assets", async ({ request }) => {
  4  |   const manifest = await request.get("manifest.webmanifest");
  5  |   expect(manifest.ok()).toBeTruthy();
  6  |   await expect(manifest.json()).resolves.toMatchObject({
  7  |     display: "standalone",
  8  |     start_url: "/new-grad-job-alerts/",
  9  |     scope: "/new-grad-job-alerts/",
  10 |   });
  11 | 
  12 |   const worker = await request.get("OneSignalSDKWorker.js");
  13 |   expect(worker.ok()).toBeTruthy();
  14 |   expect(worker.headers()["content-type"]).toContain("application/javascript");
  15 |   expect(await worker.text()).toContain("OneSignalSDK.sw.js");
  16 | });
  17 | 
  18 | test("initializes push and saves personalized companies", async ({ page }) => {
  19 |   const errors = [];
  20 |   page.on("console", (message) => {
  21 |     if (message.type() === "error") {
  22 |       errors.push(`console: ${message.text()}`);
  23 |     }
  24 |   });
  25 |   page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  26 | 
  27 |   await page.goto(`?e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });
  28 | 
  29 |   const notificationStatus = page.locator("#notification-status");
> 30 |   await expect(notificationStatus).toHaveText(
     |                                    ^ Error: expect(locator).toHaveText(expected) failed
  31 |     /Notifications are off|Push notifications are active/,
  32 |     { timeout: 20_000 },
  33 |   );
  34 | 
  35 |   await page.locator("#recommended-button").click();
  36 |   await expect(page.locator("#selection-count")).toHaveText("39 selected");
  37 | 
  38 |   const enableButton = page.locator("#enable-button");
  39 |   if (await enableButton.isEnabled()) {
  40 |     await enableButton.click();
  41 |   }
  42 |   await expect(notificationStatus).toHaveText(
  43 |     "Push notifications are active on this device.",
  44 |     { timeout: 20_000 },
  45 |   );
  46 | 
  47 |   await page.locator("#save-button").click();
  48 |   await expect(page.locator("#save-status")).toHaveText(
  49 |     "Preferences saved. Your alerts are active.",
  50 |     { timeout: 10_000 },
  51 |   );
  52 | 
  53 |   const registrationUrls = await page.evaluate(async () => {
  54 |     const registrations = await navigator.serviceWorker.getRegistrations();
  55 |     return registrations.map((registration) => registration.active?.scriptURL);
  56 |   });
  57 |   expect(registrationUrls).toContain(
  58 |     "https://arjunbojja1.github.io/new-grad-job-alerts/OneSignalSDKWorker.js",
  59 |   );
  60 |   expect(errors).toEqual([]);
  61 | });
  62 | 
```