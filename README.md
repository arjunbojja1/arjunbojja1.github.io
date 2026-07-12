# New Grad Job Alerts PWA

An installable GitHub Pages app for personalized Web Push notifications from
the [`New-Grad-2027`](https://github.com/vanshb03/New-Grad-2027) tracker.
Subscribers choose companies anonymously; their preferences are stored as
OneSignal Data Tags.

## OneSignal setup

1. Create a OneSignal Web Push app.
2. Set its Site URL to `https://arjunbojja1.github.io`.
3. Replace the empty `oneSignalAppId` in `config.js` with the public OneSignal
   App ID.
4. Keep the OneSignal REST API key only in the private scanner repository.

The service worker URL and scope must remain:

- URL: `/OneSignalSDKWorker.js`
- Scope: `/`

Moving the worker breaks existing subscriptions.

## Local validation

```bash
npm test
```

Push subscriptions require HTTPS, so test the complete flow on GitHub Pages.
