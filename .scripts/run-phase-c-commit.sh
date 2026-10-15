#!/usr/bin/env bash
# Phase C commit batch — idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

CO="Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

has_commit() { git log --oneline -200 | grep -qF -- "$1"; }

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

# === C.1: backend route refactor (assistants/dig-emp/files/audit/orgs) ===
if ! has_commit "switch agents/files/audit/org routes to getUserId"; then
  echo "=== Phase C.1: backend route refactor ==="
  stage_and_commit "refactor(api): switch agents/files/audit/org routes to getUserId() (web + mobile auth)

Same pattern as Phase B's chat refactor: the 9 list/detail routes the mobile
Phase C surfaces hit now accept either a NextAuth session or a mobile JWT
Bearer token. No behavior change for the web dashboard.

$CO" \
    src/app/api/assistants/route.ts \
    src/app/api/assistants/'[id]'/route.ts \
    src/app/api/dashboard/digital-employees/route.ts \
    src/app/api/dashboard/digital-employees/'[id]'/route.ts \
    src/app/api/dashboard/files/route.ts \
    src/app/api/dashboard/files/'[id]'/route.ts \
    src/app/api/dashboard/audit/route.ts \
    src/app/api/organizations/route.ts \
    src/app/api/organizations/'[id]'/route.ts
fi

# === C.2: mobile API clients ===
if ! has_commit "agents/knowledge/ops API clients"; then
  echo "=== Phase C.2: mobile API clients ==="
  stage_and_commit "feat(mobile): agents/knowledge/ops API clients (assistants, digital-employees, files, audit, organizations)

$CO" \
    mobile/src/api/assistants.ts \
    mobile/src/api/digital-employees.ts \
    mobile/src/api/files.ts \
    mobile/src/api/audit.ts \
    mobile/src/api/organizations.ts
fi

# === C.3: mobile feature hooks ===
if ! has_commit "TanStack Query hooks for agents/knowledge/ops"; then
  echo "=== Phase C.3: mobile feature hooks ==="
  stage_and_commit "feat(mobile): TanStack Query hooks for agents/knowledge/ops surfaces

$CO" \
    mobile/src/features/agents/ \
    mobile/src/features/knowledge/ \
    mobile/src/features/ops/
fi

# === C.4: mobile agent screens (replace placeholder + add details) ===
if ! has_commit "agent screens (assistants/digital-employees list + detail)"; then
  echo "=== Phase C.4: mobile agent screens ==="
  stage_and_commit "feat(mobile): agent screens (assistants/digital-employees list + detail with 'Manage on web' CTA)

$CO" \
    mobile/app/'(tabs)'/agents/index.tsx \
    mobile/app/'(tabs)'/agents/assistants/'[id]'.tsx \
    mobile/app/'(tabs)'/agents/digital-employees/'[id]'.tsx
fi

# === C.5: mobile knowledge screens ===
if ! has_commit "knowledge screens (files list + detail)"; then
  echo "=== Phase C.5: mobile knowledge screens ==="
  stage_and_commit "feat(mobile): knowledge screens (files list + detail with open/manage)

$CO" \
    mobile/app/'(tabs)'/knowledge/index.tsx \
    mobile/app/'(tabs)'/knowledge/files/'[id]'.tsx
fi

# === C.6: mobile ops screen ===
if ! has_commit "ops screen (audit log)"; then
  echo "=== Phase C.6: mobile ops screen ==="
  stage_and_commit "feat(mobile): ops screen (audit log with status pills + pull-to-refresh)

$CO" mobile/app/'(tabs)'/ops/index.tsx
fi

# === C.7: mobile settings sub-page router ===
if ! has_commit "settings sub-page router"; then
  echo "=== Phase C.7: settings sub-page router ==="
  stage_and_commit "feat(mobile): settings sub-page router (deep-linkable, Manage-on-web CTA)

$CO" mobile/app/'(tabs)'/account/settings/'[section]'.tsx
fi

echo
echo "=== ALL DONE (Phase C) ==="
git log --oneline -10
