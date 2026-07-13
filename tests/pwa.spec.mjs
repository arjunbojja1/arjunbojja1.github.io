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
  expect(worker.headers()["content-type"]).toMatch(
    /^(application|text)\/javascript/,
  );
  expect(await worker.text()).toContain("OneSignalSDK.sw.js");

  const supabase = await request.get("vendor/supabase.js");
  expect(supabase.ok()).toBeTruthy();
  expect(await supabase.text()).toContain("createClient");
});

test("requires authentication before showing the application", async ({
  page,
}) => {
  await page.goto(`?e2e=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("#account-dialog")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("#account-button")).toHaveText("Sign in");
  await expect(page.locator("#google-signin")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/auth-required/);
  await expect(page.locator(".app-header")).toBeHidden();

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
