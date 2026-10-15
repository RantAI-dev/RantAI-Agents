#!/usr/bin/env bash
# Phase A backend batch — idempotent. Skips any task whose commit already exists.
# Run from the worktree: bash .scripts/run-phase-a-backend.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "WORKDIR: $(pwd)"
echo "BRANCH: $(git branch --show-current)"

CO="Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

has_commit() {
  local needle="$1"
  if git log --oneline -200 | grep -qF -- "$needle"; then
    return 0
  else
    return 1
  fi
}

# Helper: stage given files, commit only if there are staged changes.
# Idempotent — silent no-op when nothing to commit.
stage_and_commit() {
  local message="$1"
  shift
  git add "$@" 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "  (nothing new to commit — already committed)"
    return 0
  fi
  git commit -m "$message"
}

# === Env setup: worktrees don't share .env with the main checkout ===
# Symlink parent .env so Prisma sees DATABASE_URL etc.
PARENT_ENV="$(git rev-parse --git-common-dir)/../.env"
if [ ! -e .env ] && [ -e "$PARENT_ENV" ]; then
  ln -s "$(realpath "$PARENT_ENV")" .env
  echo "Symlinked parent .env into worktree"
fi
# Ensure MOBILE_JWT_* vars exist in env (append to user's local .env if missing)
if [ -e .env ] && ! grep -q "^MOBILE_JWT_SECRET=" .env 2>/dev/null; then
  {
    echo
    echo "# Mobile auth (auto-added by run-phase-a-backend.sh)"
    echo "MOBILE_JWT_SECRET=\"$(openssl rand -base64 48 | tr -d '\n')\""
    echo "MOBILE_JWT_ACCESS_TTL=\"900\""
    echo "MOBILE_JWT_REFRESH_TTL=\"2592000\""
  } >> .env
  echo "Appended MOBILE_JWT_* keys to .env (gitignored, safe)"
fi

# === Task 1: Prisma migration ===
if ! has_commit "feat(db): add MobileSession and MobilePushToken"; then
  echo "=== Task 1: Prisma migration ==="
  bun run db:generate
  if bunx prisma migrate dev --name add_mobile_session_and_push_token --create-only 2>&1; then
    bun run db:migrate
    PATHS=(prisma/schema.prisma prisma/migrations/)
  else
    echo "migrate dev --create-only failed, falling back to db:push"
    bun run db:push
    PATHS=(prisma/schema.prisma)
  fi
  stage_and_commit "feat(db): add MobileSession and MobilePushToken models for mobile auth + push

$CO" "${PATHS[@]}"
fi

# === Task 2: install jose ===
if ! grep -q '"jose":' package.json; then
  echo "=== Task 2: install jose ==="
  bun add jose@^5.9.6
  stage_and_commit "chore(deps): add jose for mobile JWT issuance

$CO" package.json bun.lock
fi

# === Task 3: .env.example MOBILE_JWT_* keys ===
if ! has_commit "MOBILE_JWT_" && git status --porcelain .env.example | grep -q .; then
  echo "=== Task 3: .env.example ==="
  stage_and_commit "chore(env): add MOBILE_JWT_* config keys

$CO" .env.example
fi

# === Tasks 4+5: auth-mobile ===
if ! has_commit "JWT issue/verify"; then
  echo "=== Tasks 4+5: auth-mobile ==="
  bunx vitest run tests/unit/auth-mobile.test.ts
  stage_and_commit "feat(auth-mobile): JWT issue/verify + refresh token utilities

$CO" src/lib/auth-mobile.ts tests/unit/auth-mobile.test.ts
fi

# === Tasks 6+7: auth-helpers ===
if ! has_commit "requireUserAndOrg"; then
  echo "=== Tasks 6+7: auth-helpers ==="
  bunx vitest run tests/integration/api/auth-helpers.test.ts
  stage_and_commit "feat(auth): add requireUserAndOrg helper accepting NextAuth or mobile JWT

$CO" src/lib/auth-helpers.ts tests/integration/api/auth-helpers.test.ts
fi

# === Tasks 8-10: mobile auth routes ===
if ! has_commit "mobile auth login"; then
  echo "=== Tasks 8-10: mobile auth routes ==="
  bunx vitest run tests/integration/api/mobile-auth.test.ts
  stage_and_commit "feat(api): mobile auth login/refresh/logout + session listing/revocation

$CO" src/app/api/mobile/auth/ tests/integration/api/mobile-auth.test.ts
fi

# === Task 11: mobile push routes ===
if ! has_commit "mobile push token register"; then
  echo "=== Task 11: mobile push routes ==="
  bunx vitest run tests/integration/api/mobile-push.test.ts
  stage_and_commit "feat(api): mobile push token register/unregister

$CO" src/app/api/mobile/push/ tests/integration/api/mobile-push.test.ts
fi

# =====================================================================
# MOBILE PORTION (Phase A.6 – A.11)
# =====================================================================

# === Generate placeholder PNG assets if missing (1x1 transparent) ===
mkdir -p mobile/assets
PLACEHOLDER_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
for f in icon.png splash.png adaptive-icon.png notification-icon.png favicon.png; do
  if [ ! -e "mobile/assets/$f" ]; then
    echo -n "$PLACEHOLDER_B64" | base64 -d > "mobile/assets/$f"
  fi
done

# === Install mobile dependencies (idempotent — bun install is a no-op if up-to-date) ===
if [ ! -d mobile/node_modules ] || [ ! -e mobile/bun.lock ]; then
  echo "=== Mobile: bun install ==="
  ( cd mobile && bun install )
fi

# === Mobile commit 1: scaffold (config files + assets + README + .gitignore) ===
if ! has_commit "scaffold Expo SDK 54"; then
  echo "=== Mobile commit 1: scaffold ==="
  stage_and_commit "feat(mobile): scaffold Expo SDK 54 / RN 0.82 project (NativeWind, Reanimated, EAS)

$CO" \
    mobile/package.json mobile/bun.lock mobile/tsconfig.json mobile/app.json mobile/eas.json \
    mobile/babel.config.js mobile/metro.config.js mobile/tailwind.config.js mobile/global.css \
    mobile/nativewind-env.d.ts mobile/.env.example mobile/vitest.config.ts \
    mobile/.gitignore mobile/README.md mobile/assets/
fi

# === Mobile commit 2: design tokens + theme ===
if ! has_commit "design tokens + theme"; then
  echo "=== Mobile commit 2: design tokens + theme ==="
  stage_and_commit "feat(mobile): design tokens + theme objects mirroring web Tailwind

$CO" mobile/src/styles/
fi

# === Mobile commit 3: lib utilities (env, mmkv, query-client, sentry, device-id, cn) ===
if ! has_commit "mobile lib utilities"; then
  echo "=== Mobile commit 3: lib utilities ==="
  stage_and_commit "feat(mobile): lib utilities (env, MMKV, TanStack Query, Sentry, device-id, cn)

$CO" mobile/src/lib/
fi

# === Mobile commit 4: auth client + push register ===
if ! has_commit "mobile auth client"; then
  echo "=== Mobile commit 4: auth client + push register ==="
  stage_and_commit "feat(mobile): auth client (multi-account SecureStore + Zustand + biometric) + push register

$CO" mobile/src/auth/ mobile/src/api/ mobile/src/push/
fi

# === Mobile commit 5: UI primitives + providers ===
if ! has_commit "UI primitives"; then
  echo "=== Mobile commit 5: UI primitives + providers ==="
  stage_and_commit "feat(mobile): UI primitives (Button, Card, Input) + theme/auth providers

$CO" mobile/src/components/
fi

# === Mobile commit 6: app routes (auth screens + tabs shell) ===
if ! has_commit "auth screens + tabs shell"; then
  echo "=== Mobile commit 6: app routes ==="
  stage_and_commit "feat(mobile): app routes — auth screens (login, account-picker, biometric) + 5-tab shell

$CO" mobile/app/
fi

# === Mobile commit 7: tests + maestro ===
if ! has_commit "mobile tests + Maestro"; then
  echo "=== Mobile commit 7: tests + maestro ==="
  ( cd mobile && bun run test )
  stage_and_commit "test(mobile): account-store + apiFetch unit tests + Maestro login flow

$CO" mobile/__tests__/ mobile/.maestro/
fi

# === Root README pointer ===
if ! has_commit "Mobile app section in root README" && git status --porcelain README.md | grep -q .; then
  echo "=== Root README mobile pointer ==="
  stage_and_commit "docs: add Mobile app section to root README pointing to mobile/

$CO" README.md
fi

echo
echo "=== ALL DONE ==="
git log --oneline -20
