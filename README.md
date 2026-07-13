# Job Alerts PWA

An installable GitHub Pages app for personalized Web Push notifications from
the [`New-Grad-2027`](https://github.com/vanshb03/New-Grad-2027) and
[`Summer2027-Internships`](https://github.com/vanshb03/Summer2027-Internships)
trackers, plus selected Greenhouse, Lever, Ashby, and Workday career sites.

Supabase stores each user's filters, job applications, ATS monitors, and
private resume profile. OneSignal subscriptions use the Supabase user ID as
their external ID, so notification targeting does not depend on Data Tags.
Guest profiles work without an account. Email sign-in syncs a permanent
profile across devices and transfers local selections for new accounts. The
Google button is feature-gated until Google OAuth credentials are configured.

## OneSignal setup

1. Create a OneSignal Web Push app.
2. Set its Site URL to `https://arjunbojja1.github.io`.
3. Replace the empty `oneSignalAppId` in `config.js` with the public OneSignal
   App ID.
4. Keep the OneSignal REST API key only in the private scanner repository.

## Supabase setup

`config.js` contains only the public project URL and publishable key. Apply the
migrations in `supabase/migrations`, then push `supabase/config.toml`. The
scanner repository must hold the private Supabase secret key.

Resume PDFs are limited to 5 MB and stored in the private `resumes` bucket.
PDF text extraction and skill detection run in the browser.

The service worker URL and scope must remain:

- URL: `/OneSignalSDKWorker.js`
- Scope: `/`

Moving the worker breaks existing subscriptions.

## Local validation

```bash
npm test
npm run test:e2e
```

The Playwright suite uses a persistent Chrome profile because Chrome disables
the Push API in incognito browser contexts.
