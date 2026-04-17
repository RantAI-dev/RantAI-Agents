# Mobile Release Guide (Phase E — Store Submission)

These are the manual steps that cannot be automated — they require human
accounts, certificates, and review submissions.

## Prerequisites

1. **Apple Developer Program** membership ($99/year) — required for TestFlight
   and App Store
2. **Google Play Developer** account ($25 one-time) — required for Play Store
3. **Expo (EAS) account** — free tier is fine for individual dev
4. Environment: `mobile/.env.local` with production `EXPO_PUBLIC_API_BASE_URL`
   and `EXPO_PUBLIC_SENTRY_DSN`

## One-time setup

```bash
cd mobile
bunx eas login
bunx eas init                       # creates EAS project ID
```

Copy the EAS project ID into `app.json` under `extra.eas.projectId` (EAS init
does this automatically) and set `updates.url` to the printed URL.

## Credentials

### iOS

```bash
bunx eas credentials                # interactive — pick 'iOS' and let EAS
                                    # generate distribution certs + provisioning
                                    # profiles for both App Store and Ad Hoc
```

For TestFlight/App Store upload you also need:

- An App ID in Apple Developer (`ai.rantai.mobile`) with Push Notifications
  capability enabled
- A new app record in App Store Connect with the same bundle id
- Update `mobile/eas.json` `submit.production.ios` with `appleId` and
  `ascAppId`

### Android

```bash
# Generate the signing keystore via EAS (safest):
bunx eas credentials                # pick 'Android' and let EAS manage the keystore

# Create a Google Play service account (for EAS Submit):
#   https://expo.dev/accounts/<you>/projects/rantai-mobile/service-account
# Download the JSON and save as mobile/gp-service-account.json (gitignored)
```

## Push notification setup

### Apple Push (APNs)

Expo Push handles APNs for you. But first, in the Apple Developer portal:

1. Create an **APNs Auth Key** (type: `APNs`, .p8 file)
2. Upload the .p8 to Expo:

```bash
bunx eas credentials
# → iOS → Push Notifications → Set up Push Notifications → paste key + key ID + team ID
```

### Firebase Cloud Messaging (FCM) for Android

1. Create a Firebase project at https://console.firebase.google.com
2. Add an Android app (`ai.rantai.mobile`), download `google-services.json`
3. Place at `mobile/google-services.json` (gitignored)
4. In Firebase → Project Settings → Cloud Messaging, copy the Server Key
5. Upload to Expo:

```bash
bunx eas credentials
# → Android → Push Notifications → paste FCM server key
```

## Universal / App Links

For `https://app.rantai.ai/conversation/:id` → open in app:

### iOS
Host `apple-app-site-association` from your web origin at `/.well-known/`:

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.ai.rantai.mobile"],
      "components": [
        { "/": "/conversation/*" },
        { "/": "/assistant/*" },
        { "/": "/digital-employee/*" }
      ]
    }]
  }
}
```

Add to `app.json` under `ios.associatedDomains`:
```json
"associatedDomains": ["applinks:app.rantai.ai"]
```

### Android
Host `assetlinks.json` at `/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ai.rantai.mobile",
    "sha256_cert_fingerprints": ["<from EAS keystore>"]
  }
}]
```

## Beta builds

```bash
# iOS (TestFlight)
bunx eas build --profile preview --platform ios
bunx eas submit --profile production --platform ios --latest

# Android (Play Internal)
bunx eas build --profile preview --platform android
bunx eas submit --profile production --platform android --latest
```

## Production release

After beta smoke-test:

```bash
bunx eas build --profile production --platform all
bunx eas submit --profile production --platform all --latest
```

For OTA JS-only updates between native builds:

```bash
bunx eas update --channel production --message "bug fix X"
```

## Maestro E2E in CI

Add to `.github/workflows/mobile-e2e.yml`:

```yaml
on:
  pull_request:
    paths: ['mobile/**']
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: cd mobile && bun install
      - run: cd mobile && bunx eas build --profile preview --platform android --local --non-interactive
      - run: curl -Ls "https://get.maestro.mobile.dev" | bash
      - run: maestro cloud mobile/.maestro/
        env:
          MAESTRO_CLOUD_API_KEY: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
```

## Store assets checklist

Before submitting:

- [ ] App icon (1024×1024, no alpha, no rounded corners) — replace placeholder at `mobile/assets/icon.png`
- [ ] Splash screen — replace `mobile/assets/splash.png`
- [ ] Android adaptive icon foreground — replace `mobile/assets/adaptive-icon.png`
- [ ] Notification icon (monochrome, 24dp) — replace `mobile/assets/notification-icon.png`
- [ ] Screenshots (6.7", 5.5" iPhone + 7" tablet for iOS; phone + 7"/10" tablet for Android)
- [ ] Store descriptions (short 80 chars + long 4000 chars)
- [ ] Privacy policy URL (required by both stores)
- [ ] App Store Connect "App Privacy" questionnaire filled
- [ ] Google Play Data Safety form filled
- [ ] App category + content rating
- [ ] Support URL + marketing URL

## Post-launch

- Monitor Sentry dashboard for crashes
- Watch EAS Insights for OTA adoption
- Crash-free rate target: > 99.5%
- Check App Store Connect + Play Console weekly for reviews

## Common gotchas

- **iOS build succeeds but push doesn't fire**: re-check APNs key is uploaded and `ios.infoPlist.UIBackgroundModes` includes `remote-notification` (it isn't in the default Expo config — add it if needed)
- **Android build FCM error**: `google-services.json` missing or has wrong package name
- **Universal Links don't trigger the app**: device may have cached the AASA file; uninstall + reinstall, or add `mode=developer` query param to test
- **OTA update doesn't reach users**: check `runtimeVersion` matches the installed app's native version (set to `{ "policy": "appVersion" }` in Phase A)
