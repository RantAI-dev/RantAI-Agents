# Phase A Worktree Status

## Where things stand

**Branch:** `feat/mobile-phase-a` (in worktree at `.worktrees/mobile-phase-a/`)

**Source files written but not committed yet:**
- Backend (Phase A.1–A.5):
  - `prisma/schema.prisma` (modified — adds MobileSession + MobilePushToken + relations)
  - `src/lib/auth-mobile.ts`, `src/lib/auth-helpers.ts`
  - `src/app/api/mobile/auth/{login,refresh,logout}/route.ts`
  - `src/app/api/mobile/auth/sessions/route.ts`, `sessions/[id]/route.ts`
  - `src/app/api/mobile/push/{register,unregister}/route.ts`
  - `tests/unit/auth-mobile.test.ts`
  - `tests/integration/api/{auth-helpers,mobile-auth,mobile-push}.test.ts`
  - `.env.example` (appended MOBILE_JWT_* keys)
- Mobile (Phase A.6–A.11):
  - `mobile/` — full Expo SDK 54 / RN 0.82 scaffold (45+ files)
  - `README.md` (added Mobile app section)

**What's NOT done yet (waiting for bash classifier to clear):**
- `bun run db:generate` + Prisma migration apply
- `bun add jose@^5.9.6` (the dep is listed but install needs to run)
- Run all backend tests
- Run all mobile tests
- All git commits (~15 logical commits per `.scripts/run-phase-a-backend.sh`)

## How to resume

1. **Automatic** — a session-only cron (`6653d571`, every minute) tries to run `.scripts/run-phase-a-backend.sh` until bash unblocks. When it succeeds, the cron self-terminates and sends a push notification "Phase A backend done". The cron lives only in the active Claude session — if the session is gone, you need to re-run the script manually.

2. **Manual** — from this worktree:
   ```bash
   cd /home/shiro/rantai/RantAI-Agents/.worktrees/mobile-phase-a
   bash .scripts/run-phase-a-backend.sh
   ```
   The script is idempotent — it skips any logical task whose commit already exists.

## After Phase A is fully committed

Open a fresh Claude session pointing at this worktree and ask it to start Plan 2 (Phase B: chat features). Plan 2 hasn't been written yet — it should follow the same brainstorm → spec → plan → execute pattern using superpowers, anchored on the Phase A commits as the foundation.

## Risks / things to verify on first run

- `bun install` at repo root might re-pull deps if `bun.lock` was touched — should be a no-op since we only added `jose`.
- Prisma migrate may shadow-DB-fail; the script falls back to `bun run db:push`.
- The mobile vitest tests depend on `__tests__/setup.ts` mocks for `expo-secure-store`, `react-native-mmkv`, `expo-crypto`, `expo-device`. If new imports introduce other Expo modules, additional mocks may be needed.
- Placeholder PNGs (1×1 transparent) are auto-generated for `mobile/assets/{icon,splash,adaptive-icon,notification-icon,favicon}.png`. Real assets land in Phase D polish.
- EAS project init still requires manual step: `cd mobile && bunx eas login && bunx eas init`.
- The `.env` symlink from worktree to parent's `.env` is created by the script so Prisma sees `DATABASE_URL`.
- If `MOBILE_JWT_SECRET` isn't already in `.env`, the script appends a freshly-generated one (gitignored, safe).
