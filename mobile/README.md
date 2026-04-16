# RantAI Mobile

Expo SDK 54 / React Native 0.82 app for iOS + Android. Shares the existing Next.js backend — mobile-only routes are namespaced under `/api/mobile/*`.

## Quickstart

```bash
cd mobile
bun install
cp .env.example .env.local   # set EXPO_PUBLIC_API_BASE_URL
bunx expo start
```

If this is your first run, also generate the Expo Router types and ensure native deps are linked:

```bash
bunx expo install --check
```

## Builds (EAS)

| Profile | What | Command |
| --- | --- | --- |
| development | Dev client + tunnel | `bunx eas build --profile development --platform <ios\|android>` |
| preview | TestFlight + Play Internal | `bunx eas build --profile preview --platform <ios\|android>` |
| production | App Store + Play Store | `bunx eas build --profile production --platform <ios\|android>` |

First-time setup:

```bash
bunx eas login
bunx eas init   # creates the EAS project + writes extra.eas.projectId into app.json
```

Then add the Updates URL to `app.json` if missing.

## OTA updates

```bash
bunx eas update --channel preview
bunx eas update --channel production
```

## Tests

```bash
bun run test                # vitest unit + component
bunx maestro test .maestro/ # E2E (requires running build on simulator/emulator)
```

## Environment variables

- `EXPO_PUBLIC_API_BASE_URL` — backend origin (e.g. `https://app.rantai.ai` or `http://localhost:3000`)
- `EXPO_PUBLIC_SENTRY_DSN` — optional, enables Sentry crash reporting

## Layout

```
app/                  Expo Router file-based routes
├── (auth)/           login, account picker, biometric unlock
└── (tabs)/           5 main tabs (chat, agents, knowledge, ops, account)
src/
├── api/              fetch client with auto-refresh on 401
├── auth/             multi-account SecureStore + Zustand + biometric gate
├── components/       react-native-reusables UI primitives + providers
├── lib/              env, mmkv, query-client, sentry, device-id, cn
├── push/             Expo push token registration
└── styles/           design tokens + theme
```
