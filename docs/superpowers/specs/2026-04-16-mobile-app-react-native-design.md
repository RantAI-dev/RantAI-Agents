# RantAI-Agents Mobile App — Design Spec

**Date**: 2026-04-16
**Author**: kleopasevan + Claude (brainstorm)
**Status**: Approved for implementation planning
**Target platforms**: iOS 16+, Android 10+ (API 29+)

---

## 1. Goal

Ship a native mobile app for the RantAI-Agents platform on iOS and Android that delivers near-parity with the web dashboard (every primary surface except workflows) while feeling native and looking as polished as the existing web product.

## 2. Scope

### In scope (v1)

Every dashboard surface except workflows:

- Chat (conversation list, conversation detail, streaming responses, attachments, voice input)
- Agents (assistants, agent-builder read + edit, digital-employees)
- Knowledge (files, media, groups, marketplace)
- Ops (audit log, organization)
- Account (settings, account, organization switcher)
- Auth (email + password login, biometric unlock, multi-account on one device)
- Push notifications for chat replies, digital-employee handoffs, audit alerts, org invites
- Light + dark theme following system, with manual override

### Out of scope (v1, deferred to v1.1+)

- Workflows screens — replaced with "Manage on web" empty state + deep link
- iOS Share Extension, App Intents / Siri shortcuts, Android App Actions
- Home-screen widgets, iOS Live Activities
- Optimistic offline writes (write-queue) — v1 is read-cached only
- In-app purchases / Stripe billing UI — keep on web to avoid Apple's 30% cut decision until separately scoped

## 3. Decisions (locked during brainstorm)

| Topic | Decision |
| --- | --- |
| Framework | Expo SDK 54 (managed), React Native 0.82 with New Architecture, React 19 + React Compiler |
| Routing | Expo Router v5 (file-based, typed routes) |
| UI library | NativeWind v4 + react-native-reusables (shadcn-equivalent) |
| Animations | react-native-reanimated 4 + react-native-gesture-handler |
| Lists | `@shopify/flash-list` v2 |
| Images | `expo-image` with blurhash placeholders |
| State (server) | TanStack Query v5 with MMKV-backed persister |
| State (client) | Zustand 5 |
| Validation | Zod (shared with web) |
| Realtime | `socket.io-client` 4.x + Expo Push Notifications |
| Streaming chat | `expo/fetch` ReadableStream + `@ai-sdk/react` `useChat` |
| Auth | Mobile JWT (15m access + 30d rotating refresh) — added to backend; biometric unlock via `expo-local-authentication`; multi-account |
| Backend strategy | Reuse existing Next.js API; add `/api/mobile/*` only where payload is too heavy |
| Offline | Read-cached only (no write queue in v1) |
| Min OS | iOS 16+, Android 10+ (API 29) |
| Distribution | EAS Build + EAS Submit + EAS Update for OTA |
| Observability | Sentry + EAS Insights |

## 4. Repository placement

New top-level `mobile/` directory inside the existing `RantAI-Agents` repo. Self-contained Expo project with its own `package.json` (no PNPM/Yarn workspaces — keeps web build untouched). EAS builds run from `mobile/`, web builds from repo root, separate CI lanes.

```
RantAI-Agents/
├── src/                  # existing Next.js web app
├── mobile/               # NEW — Expo app
│   ├── app/              # Expo Router v5 file-based routes
│   ├── src/
│   │   ├── api/          # fetch client, types, hooks (TanStack Query)
│   │   ├── auth/         # token store, biometric, multi-account
│   │   ├── components/   # rnr wrappers + brand components
│   │   ├── features/     # feature folders mirroring web
│   │   ├── lib/          # query client, mmkv, socket, push, theme
│   │   └── styles/       # nativewind globals + tokens
│   ├── assets/           # icons, splash, fonts
│   ├── app.json
│   ├── eas.json
│   ├── package.json
│   └── tsconfig.json
└── …
```

Type-sharing: `mobile/src/api/types.ts` re-exports Zod schemas from `src/features/*/schema.ts` via a relative import + `tsconfig` `paths` alias. No publish step; the mobile build sees the source directly.

## 5. Navigation structure (Expo Router v5)

Bottom tab bar with 5 primary tabs + a global modal/stack layer.

```
app/
├── (auth)/
│   ├── login.tsx
│   ├── account-picker.tsx
│   └── biometric.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── chat/
│   │   ├── index.tsx                 # conversation list
│   │   ├── new.tsx                   # new chat (assistant picker)
│   │   └── [id].tsx                  # conversation detail
│   ├── agents/
│   │   ├── index.tsx                 # tabbed: assistants / digital-employees
│   │   ├── assistants/[id].tsx
│   │   ├── assistants/[id]/edit.tsx  # agent-builder
│   │   └── digital-employees/[id].tsx
│   ├── knowledge/
│   │   ├── index.tsx                 # tabbed: files / media / groups / marketplace
│   │   ├── files/[id].tsx
│   │   ├── groups/[id].tsx
│   │   └── marketplace/[slug].tsx
│   ├── ops/
│   │   ├── index.tsx                 # audit
│   │   ├── audit/[id].tsx
│   │   └── organization.tsx
│   └── account/
│       ├── index.tsx
│       └── settings/[section].tsx
├── modals/
│   ├── attach-sheet.tsx
│   ├── account-switcher.tsx
│   └── tool-picker.tsx
└── _layout.tsx                       # root provider stack
```

Workflows surfaces are absent from the tab bar; any deep link or backend reference renders an empty-state card with "Manage on web" + universal link to the web dashboard.

## 6. Screen inventory (web → mobile mapping)

For every existing dashboard route in `src/app/dashboard/*` (except workflows), there is a mobile screen in the corresponding `mobile/src/features/*` folder. Highlights of non-obvious adaptations:

- **Chat detail** — virtualized FlashList of messages, bottom composer (attach / voice / send), streaming token rendering via `useChat`, keyboard-avoiding behavior, swipe-down-to-dismiss
- **Agent builder** — react-native-reusables `Form` for fields; bottom-sheet pickers for model/tool/MCP selection. Any "canvas-style" features (visual graph editing, if added later) show "Manage on web" CTA
- **Files / Knowledge** — chunked upload via `expo-document-picker` → multipart to existing `/api/files` upload route; PDF preview via `react-native-pdf`; unsupported types open the system share-sheet
- **Marketplace** — same listing API as web; install confirmation as a bottom sheet
- **Audit** — paginated FlashList with filter chips; tap row → detail screen
- **Settings** — grouped lists matching iOS/Android conventions; consumes existing `/api/dashboard/settings/*` endpoints

## 7. Auth flow

### Backend additions (Next.js)

- `POST /api/mobile/auth/login` — accepts `{ email, password, deviceId, deviceName, platform }`; returns `{ accessToken, refreshToken, user, org }`
- `POST /api/mobile/auth/refresh` — rotating refresh token; old token marked used; returns new pair
- `POST /api/mobile/auth/logout` — revokes the current `MobileSession`
- `GET  /api/mobile/auth/sessions` — list active sessions for current user
- `DELETE /api/mobile/auth/sessions/:id` — revoke a specific session ("sign out other devices")

### Database (Prisma additions)

```prisma
model MobileSession {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId          String   // client-generated UUID, stable per install
  deviceName        String
  platform          String   // "ios" | "android"
  refreshTokenHash  String   // sha256 of current refresh token
  createdAt         DateTime @default(now())
  lastUsedAt        DateTime @default(now())
  expiresAt         DateTime
  revokedAt         DateTime?

  @@unique([userId, deviceId])
  @@index([userId])
  @@index([refreshTokenHash])
}
```

### Universal middleware

`src/lib/auth-helpers.ts` exposes `authenticateRequest(req): Promise<{ user, org } | NextResponse>` that accepts EITHER:
- a valid NextAuth session cookie (web), OR
- a valid `Authorization: Bearer <jwt>` header (mobile, verified against `MobileSession.userId`).

Every existing API route migrates to this helper (mechanical refactor, no behavior change). Once migrated, all current `/api/*` routes work for mobile unchanged.

### Client (mobile)

- Refresh token stored in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android), namespaced per account: `accounts/{accountId}/refreshToken`
- Access token kept in memory only (Zustand `useAuthStore`)
- Biometric unlock: on cold start AND after 5 minutes backgrounded, `expo-local-authentication` prompt gates token release. If biometrics fail or unavailable, fall back to password re-auth
- Multi-account: SecureStore key namespace allows N stored accounts; account switcher hot-swaps the active TanStack Query client + socket connection
- App boot sequence: load active accountId → biometric prompt → load tokens → refresh if expired → mount app → register push token

## 8. Data layer & offline

### Caching

- **TanStack Query v5** is the single source of truth for server state. Query keys mirror REST paths: `['conversations']`, `['conversations', id]`, `['assistants', id, 'messages', { cursor }]`
- Persistence via `@tanstack/query-async-storage-persister` adapted to `react-native-mmkv` (10× faster than AsyncStorage)
- Persister config: `maxAge: 7 days`, allow-list of cacheable query keys (no auth tokens, no in-flight mutations, no drafts)
- Optimistic updates on send-message, edit-assistant, etc.
- Cursor-based infinite queries for all lists

### Zustand stores

- `useAuthStore` — current accountId, user, org, in-memory access token
- `useUIStore` — bottom-sheet state, active tab, theme override
- `useDraftStore` — per-conversation message drafts (persisted to MMKV)

### Offline behavior (v1 = read-cached)

- All cached lists/details remain browsable when offline
- Mutations are NOT queued — they show a toast: "You're offline — try again when reconnected"
- When app foregrounds, TanStack Query auto-refetches stale queries
- Background refetch interval: disabled (battery); manual pull-to-refresh on every list

## 9. Realtime + push notifications

### Socket.io

- Connects on auth-success and on `AppState` → active
- Disconnects 30 s after `AppState` → background (grace window for quick toggles)
- Reuses existing socket events from web (`conversation:update`, `runtime:message`, `digital-employee:status`, etc.)
- Events feed directly into TanStack Query cache via `queryClient.setQueryData(...)`

### Push notifications (Expo Push)

#### Database (Prisma additions)

```prisma
model MobilePushToken {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId        String   // matches MobileSession.deviceId
  expoPushToken   String   @unique
  platform        String   // "ios" | "android"
  createdAt       DateTime @default(now())
  lastSeenAt      DateTime @default(now())
  revokedAt       DateTime?

  @@unique([userId, deviceId])
  @@index([userId])
}
```

#### Endpoints

- `POST /api/mobile/push/register` — idempotent on `expoPushToken`; updates `lastSeenAt`
- `POST /api/mobile/push/unregister`

#### Sender service

`src/lib/push/sender.ts` wraps the Expo Push API:
- Batches up to 100 messages per request (Expo limit)
- Handles `DeviceNotRegistered` receipts by marking token revoked
- Exponential backoff on transient errors

#### Trigger points (wired into existing code)

- Assistant streams a reply while user backgrounded (chat service)
- Digital-employee requests human handoff (runtime service)
- Audit alert on failed run (audit service)
- Organization invite issued (organization service)

#### Notification UX

- Categories with quick-reply action ("Reply" → opens deep link directly into composer with prefilled draft)
- Deep links: `rantai://conversation/:id`, `rantai://assistant/:id`, `rantai://digital-employee/:id`
- Universal/App Links: `apple-app-site-association` and Android asset links served from web app's `/.well-known/`

## 10. Chat streaming on RN

AI SDK v6 streams via SSE. RN 0.82's `expo/fetch` exposes a streaming `ReadableStream` body.
`@ai-sdk/react` `useChat` accepts a custom `fetch` option:

```ts
import { fetch as expoFetch } from 'expo/fetch'
import { useChat } from '@ai-sdk/react'

const { messages, sendMessage, status, stop } = useChat({
  api: `${API_BASE}/api/chat`,
  fetch: expoFetch as unknown as typeof fetch,
  headers: () => ({ Authorization: `Bearer ${token}` }),
})
```

- No bridge / polyfill needed — same `messages`, `sendMessage`, `stop`, `status` API as web
- Token-by-token rendering uses Reanimated 4 layout animation for smooth reveal
- Streaming continues if the user navigates away from the conversation; cancellation only on explicit `stop` or new message in same conversation

## 11. Backend additions on the Next.js side (summary)

Additive only — no breaking changes to web:

- `src/app/api/mobile/auth/{login,refresh,logout,sessions}/route.ts`
- `src/app/api/mobile/push/{register,unregister}/route.ts`
- A handful of `src/app/api/mobile/*` slim-payload endpoints — added only where a measured web payload exceeds **50 KB** for a typical user OR where the response embeds rendered HTML/markup that mobile cannot consume directly. Initial candidates: `GET /api/mobile/conversations` (list), `GET /api/mobile/assistants` (list), `GET /api/mobile/files` (list with thumbnails). Each gets justified with a payload measurement before implementation
- `src/lib/auth-mobile.ts` — JWT issue/verify/refresh, deviceId binding
- `src/lib/auth-helpers.ts` — refactored to `authenticateRequest()` accepting both cookie and Bearer
- `src/lib/push/sender.ts` + 4–6 small trigger hooks in existing services (chat, runtime, audit, organization)
- New Prisma models: `MobileSession`, `MobilePushToken`

## 12. Design system & visual fidelity

- Web Tailwind tokens (`tailwind.config.ts`) mirrored in `mobile/src/styles/tokens.ts` — same color ramp, spacing scale, radii, font sizes
- shadcn components ported via react-native-reusables: `Button`, `Card`, `Sheet`, `Dialog`, `Tabs`, `Input`, `Textarea`, `Avatar`, `Badge`, `Switch`, `Toast`, `DropdownMenu`, `Popover`, `Form`
- **Typography**: Inter (web parity) loaded via `expo-font`; iOS dynamic type respected
- **Motion**: Reanimated 4 shared-element transitions on chat list → conversation; spring presets matching web Framer Motion easing
- **Theme**: follows system theme by default (web parity via `next-themes`); manual override stored in `useUIStore` and persisted
- **Haptics** via `expo-haptics` on send, long-press, swipe actions (medium impact for primary actions, selection for picks)
- **Iconography**: `lucide-react-native` (matches web `lucide-react`)

## 13. Native features (v1)

- Push notifications (Expo Push)
- Voice input via `expo-speech-recognition` in chat composer
- Camera + photo library via `expo-image-picker` for chat attachments
- Document picker via `expo-document-picker` for file uploads / RAG
- Biometric unlock via `expo-local-authentication`
- Background tasks via `expo-background-task` for app-launch sync (refresh conversations + unread count)

## 14. Build, release, OTA

- **EAS Build profiles** (`eas.json`): `development` (dev client), `preview` (TestFlight + Play Internal), `production` (App Store + Play Store)
- **EAS Update channels**: `preview` and `production` for OTA JS-only updates between native builds
- **Versioning**: `app.json` `version` for stores; `runtimeVersion: { policy: "appVersion" }` so OTA respects native compatibility
- **EAS Submit** for store uploads; App Store Connect API key + Google Play service account stored as EAS secrets
- **Code signing**: managed by EAS (no local provisioning juggling)
- **CI** (GitHub Actions):
  - PR: typecheck + unit tests + EAS preview build (Android + iOS sim)
  - Tag `mobile-vX.Y.Z`: production build + EAS Submit

## 15. Testing strategy

- **Unit**: vitest (same runner as web) — pure logic (token store, query key builders, schema parsers, push sender)
- **Component**: `@testing-library/react-native` — individual screens, forms, composer behaviors
- **E2E (Maestro)** — critical flows:
  1. Login → biometric unlock → first chat send → receive streaming reply
  2. Attach photo → send → confirm preview renders
  3. Add second account → switch → verify isolation
  4. Receive push notification → tap → land in correct conversation with deep link
  5. Go offline → browse cached conversation → attempt send → see toast → reconnect → succeed
- Maestro flows run on EAS Build maestro cloud as PR checks against the preview profile

## 16. Observability

- `sentry-expo` for JS errors + native crashes; source maps uploaded by EAS
- EAS Insights for build + update telemetry
- Custom analytics events for: login, send-message, receive-push, attach-file, account-switch (no PII; user identified by hashed userId)

## 17. Phase plan (within v1)

| Phase | Weeks | Scope |
| --- | --- | --- |
| A — Foundation | 1 | Repo scaffold, EAS setup, design tokens, navigation skeleton, auth (login + biometric + multi-account), backend mobile-auth endpoints |
| B — Chat | 2–3 | Conversation list + detail, streaming, attachments (camera + photos + docs), voice input, drafts, optimistic sends |
| C — Agents + Knowledge | 3–5 | Assistants list/detail/edit, digital-employees, files, media, groups, marketplace |
| D — Ops + Settings + Push polish | 5–6 | Audit log, organization, account & settings sub-pages, push notification triggers, deep links, haptics + animation polish |
| E — Beta + submission | 7 | TestFlight + Play Internal, Maestro E2E, Sentry triage, store assets, submit to App Store + Play Store |

Total: ~7 weeks of focused work.

## 18. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| RN 0.82 + New Architecture compatibility issues with a chosen lib | Pin all libs to versions verified against RN 0.82; smoke-test in Phase A |
| Streaming chat behaves differently on RN than web | Phase B starts with a streaming spike before broader UI work; fall back to polling-style chunks if `expo/fetch` streaming has issues |
| Apple rejects for "uses external payment" if billing UI surfaces in mobile | Keep all billing on web with universal link "Manage on web" CTA — already in scope |
| Push token churn on iOS reinstall | `MobilePushToken` upserts by `expoPushToken`; sender handles `DeviceNotRegistered` receipts and marks revoked |
| NextAuth cookie + Bearer dual auth introduces regressions | Mechanical refactor in a single PR with full test sweep before any mobile route work begins |

---

## Appendix: source-of-truth references

- Web auth: `src/lib/auth.ts` (NextAuth 5 + Credentials only, JWT session)
- Existing v1 Bearer auth (assistant-scoped, separate from mobile user auth): `src/app/api/v1/chat/completions/route.ts`, `src/features/agent-api/service.ts`
- Socket server: `src/lib/socket.ts`, wired in `server.ts`
- AI SDK version: `ai@6.0.39`, `@ai-sdk/react@3.0.41` — same versions used in mobile
- Tailwind config: `tailwind.config.ts` (tokens to mirror in `mobile/src/styles/tokens.ts`)
- Web dashboard surfaces inventoried from `src/app/dashboard/*`
