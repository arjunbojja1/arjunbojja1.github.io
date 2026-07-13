import { expect, test } from "@playwright/test";

const oneSignalStub = `
  (() => {
    const listeners = [];
    const subscription = {
      optedIn: false,
      id: null,
      token: null,
      addEventListener: (_name, callback) => listeners.push(callback),
      optIn: async () => {
        const previous = { token: subscription.token };
        subscription.optedIn = true;
        subscription.id = "test-subscription";
        subscription.token = "https://fcm.googleapis.com/test-token";
        for (const callback of listeners) {
          await callback({ previous, current: { token: subscription.token } });
        }
      },
    };
    const sdk = {
      init: async () => {},
      login: async (externalId) => { sdk.User.externalId = externalId; },
      Notifications: { isPushSupported: () => true },
      User: {
        PushSubscription: subscription,
        externalId: null,
        removeTags: async () => {},
      },
    };
    const deferred = window.OneSignalDeferred || [];
    deferred.push = (callback) => {
      Array.prototype.push.call(deferred, callback);
      Promise.resolve().then(() => callback(sdk));
    };
    window.OneSignalDeferred = deferred;
    window.OneSignal = sdk;
    for (const callback of [...deferred]) {
      Promise.resolve().then(() => callback(sdk));
    }
  })();
`;

test("persists Supabase-backed guest preferences", async ({ page }) => {
  await page.route("**/OneSignalSDK.page.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: oneSignalStub,
    }),
  );
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

  await page.goto(process.env.PWA_TEST_URL || "/", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("#account-button")).toHaveText("Guest", {
    timeout: 20_000,
  });
  const anonymousWriteErrors = await page.evaluate(async () => {
    const config = window.NEW_GRAD_ALERTS_CONFIG;
    const probe = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
    );
    const {
      data: { user },
    } = await probe.auth.getUser();
    const application = await probe.from("applications").insert({
      user_id: user.id,
      company: "RLS probe",
      title: "RLS probe",
    });
    const monitor = await probe.from("company_monitors").insert({
      user_id: user.id,
      company_name: "RLS probe",
      company_key: "rls_probe",
      provider: "ashby",
      career_url: "https://jobs.ashbyhq.com/rls-probe",
    });
    return [application.error?.code, monitor.error?.code];
  });
  expect(anonymousWriteErrors).toEqual(["42501", "42501"]);
  errors.length = 0;

  await page.locator("#recommended-button").click();
  await page.locator('input[name="track[]"][value="internship"]').check();
  await page.locator("#locations-input").fill("Bay Area, Remote");
  await page.locator('input[name="role-category[]"][value="software"]').check();
  await page.locator("#include-keywords").fill("backend, distributed systems");
  await page.locator("#save-button").click();
  await expect(page.locator("#save-status")).toHaveText(
    "Preferences saved. Enable notifications to activate alerts.",
    { timeout: 15_000 },
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#selection-count")).toHaveText("39 selected", {
    timeout: 20_000,
  });
  await expect(page.locator("#locations-input")).toHaveValue(
    "Bay Area, Remote",
  );
  await expect(
    page.locator('input[name="role-category[]"][value="software"]'),
  ).toBeChecked();
  await expect(page.locator("#include-keywords")).toHaveValue(
    "backend, distributed systems",
  );

  await page.locator('[data-view="jobs"]').click();
  await expect(page.locator("#job-list")).not.toHaveText(
    "Jobs could not be loaded.",
  );
  expect(errors).toEqual([]);
});
