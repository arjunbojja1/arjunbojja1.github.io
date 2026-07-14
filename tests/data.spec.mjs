import { expect, test } from "@playwright/test";

const oneSignalStub = `
  (() => {
    const sdk = {
      init: async () => {},
      login: async () => {},
      logout: async () => {},
      Notifications: { isPushSupported: () => true },
      User: {
        PushSubscription: {
          optedIn: false,
          id: null,
          token: null,
          addEventListener: () => {},
          optIn: async () => {},
        },
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

test("requires an account and defaults to dark mode", async ({ page }) => {
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

  await expect(page.locator("#account-dialog")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("#account-button")).toHaveText("Sign in");
  await expect(page.locator("#google-signin")).toBeVisible();
  await expect(page.locator("#account-status")).toHaveText(
    "Sign in with Google or email to continue.",
  );
  await expect(page.locator("body")).toHaveClass(/auth-required/);

  await page.keyboard.press("Escape");
  await expect(page.locator("#account-dialog")).toBeVisible();

  const state = await page.evaluate(async () => {
    const config = window.NEW_GRAD_ALERTS_CONFIG;
    const probe = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
    );
    const {
      data: { session },
    } = await probe.auth.getSession();
    return {
      hasSession: Boolean(session),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      dialogBackground: getComputedStyle(
        document.querySelector("#account-dialog"),
      ).backgroundColor,
      headerVisibility: getComputedStyle(
        document.querySelector(".app-header"),
      ).visibility,
      recommendedText: document.querySelector("#recommended-button").textContent,
      timezoneOptions: document.querySelector("#timezone-input").options.length,
      timezoneTag: document.querySelector("#timezone-input").tagName,
      feedModes: [...document.querySelector("#job-feed-mode").options].map(
        (option) => option.value,
      ),
      defaultJobSort: document.querySelector("#job-sort").value,
      navViews: [...document.querySelectorAll("[data-view]")].map(
        (button) => button.dataset.view,
      ),
      hasPrivacyControls: Boolean(
        document.querySelector("#export-data-button") &&
          document.querySelector("#delete-account-button"),
      ),
      hasIntelligenceFeatures: Boolean(
        document.querySelector("#digest-max-jobs") &&
          document.querySelector("#application-analytics") &&
          document.querySelector("#delivery-health-grid") &&
          document.querySelector("#job-min-salary") &&
          document.querySelector("#job-education-filter") &&
          document.querySelector("#job-eligible-filter"),
      ),
    };
  });

  expect(state).toEqual({
    hasSession: false,
    colorScheme: "dark",
    dialogBackground: "rgb(16, 23, 34)",
    headerVisibility: "hidden",
    recommendedText: "Select recommended 125",
    timezoneOptions: state.timezoneOptions,
    timezoneTag: "SELECT",
    feedModes: ["for_you", "all", "hidden"],
    defaultJobSort: "match",
    navViews: ["alerts", "jobs", "applications", "inbox", "resume", "status"],
    hasPrivacyControls: true,
    hasIntelligenceFeatures: true,
  });
  expect(state.timezoneOptions).toBeGreaterThan(10);
  const selectionCount = await page.evaluate(() => {
    for (let index = 0; index < 75; index += 1) {
      window.JobAlertsUI.addCompanyAndTrack(`Test Company ${index}`, "ats");
    }
    return window.JobAlertsUI.getBasicPreferences().companies.length;
  });
  expect(selectionCount).toBeGreaterThan(50);
  expect(errors).toEqual([]);
  const anonymousRejected = await page.evaluate(async () => {
    const config = window.NEW_GRAD_ALERTS_CONFIG;
    const probe = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
    );
    const { error } = await probe.auth.signInAnonymously();
    return Boolean(error);
  });
  expect(anonymousRejected).toBe(true);

  await Promise.all([
    page.waitForURL((url) => url.hostname === "accounts.google.com", {
      timeout: 20_000,
    }),
    page.locator("#google-signin").click(),
  ]);
  const oauthUrl = new URL(page.url());
  expect(oauthUrl.searchParams.get("client_id")).toBeTruthy();
  expect(oauthUrl.searchParams.get("redirect_uri")).toBe(
    "https://crzwuslcnflhfbybpeou.supabase.co/auth/v1/callback",
  );
});

test("shows a recoverable error when authentication cannot load", async ({
  page,
}) => {
  await page.route("**/OneSignalSDK.page.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: oneSignalStub,
    }),
  );
  await page.route("**/vendor/supabase.js", (route) => route.abort());

  await page.goto(process.env.PWA_TEST_URL || "/", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("#account-dialog")).toBeVisible();
  await expect(page.locator("#account-status")).toHaveText(
    "Job Alerts could not connect. Reload the page to retry.",
  );
  await expect(page.locator("#google-signin")).toBeDisabled();
  await expect(page.locator("#magic-link-signin")).toBeDisabled();
  await page.locator("#auth-email").fill("test@example.com");
  await page.locator("#auth-email").press("Enter");
  await expect(page.locator("#account-dialog")).toBeVisible();
});

test("keeps account sign-in available when the push SDK is blocked", async ({
  page,
}) => {
  await page.route(/^https:\/\/cdn\./, (route) => route.abort());
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(process.env.PWA_TEST_URL || "/", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("#account-dialog")).toBeVisible();
  await expect(page.locator("#google-signin")).toBeEnabled();
  await expect(page.locator("#magic-link-signin")).toBeEnabled();
  await expect(page.locator("#account-status")).toHaveText(
    "Sign in with Google or email to continue.",
  );
  expect(pageErrors).toEqual([]);

  await Promise.all([
    page.waitForURL((url) => url.hostname === "accounts.google.com", {
      timeout: 20_000,
    }),
    page.locator("#google-signin").click(),
  ]);
  expect(new URL(page.url()).searchParams.get("redirect_uri")).toBe(
    "https://crzwuslcnflhfbybpeou.supabase.co/auth/v1/callback",
  );
});
