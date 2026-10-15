#!/usr/bin/env bash
# Phase B chat batch — idempotent. Reuses Phase A's stage_and_commit helper.
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

# === Task 1: getUserId helper + test ===
if ! has_commit "getUserId(req) drop-in shim"; then
  echo "=== Task 1: getUserId helper ==="
  bunx vitest run tests/unit/get-user-id.test.ts
  stage_and_commit "feat(auth): add getUserId(req) drop-in shim accepting NextAuth or mobile JWT

$CO" src/lib/get-user-id.ts tests/unit/get-user-id.test.ts
fi

# === Task 2: backend chat routes refactor ===
if ! has_commit "switch chat routes to getUserId"; then
  echo "=== Task 2: refactor chat routes ==="
  # No new test added for the refactor itself — the existing test sweep covers
  # behavior. Run the auth-related tests to confirm nothing regresses.
  bunx vitest run tests/unit/auth-mobile.test.ts tests/unit/get-user-id.test.ts \
                  tests/integration/api/auth-helpers.test.ts \
                  tests/integration/api/mobile-auth.test.ts \
                  tests/integration/api/mobile-push.test.ts
  stage_and_commit "refactor(api): switch chat routes to getUserId() (web + mobile auth)

Each chat-related route now accepts either a NextAuth session cookie or a
mobile JWT Bearer token via the new getUserId(req) shim. No behavior change
for the web dashboard.

$CO" \
    src/app/api/chat/route.ts \
    src/app/api/chat/upload/route.ts \
    src/app/api/conversations/route.ts \
    src/app/api/conversations/'[id]'/messages/route.ts \
    src/app/api/conversations/'[id]'/status/route.ts \
    src/app/api/dashboard/chat/sessions/route.ts \
    src/app/api/dashboard/chat/sessions/'[id]'/route.ts \
    src/app/api/dashboard/chat/sessions/'[id]'/messages/route.ts
fi

# === Task 3: mobile API clients (conversations + messages) + test ===
if ! has_commit "conversations + messages API clients"; then
  echo "=== Task 3: mobile API clients ==="
  ( cd mobile && bunx vitest run __tests__/api/conversations.test.ts )
  stage_and_commit "feat(mobile): conversations + messages API clients

$CO" mobile/src/api/conversations.ts mobile/src/api/messages.ts \
     mobile/__tests__/api/conversations.test.ts
fi

# === Task 4: mobile chat hooks ===
if ! has_commit "TanStack Query hooks for conversations"; then
  echo "=== Task 4: mobile chat hooks ==="
  stage_and_commit "feat(mobile): TanStack Query hooks for conversations + messages + streaming + drafts

$CO" mobile/src/features/chat/
fi

# === Task 5: useDraft test ===
if ! has_commit "MMKV draft hook + test"; then
  echo "=== Task 5: useDraft test ==="
  ( cd mobile && bunx vitest run __tests__/features/chat/use-draft.test.ts )
  stage_and_commit "test(mobile): useDraft test (MMKV-backed per-conversation drafts)

$CO" mobile/__tests__/features/chat/
fi

# === Task 6: mobile chat UI components ===
if ! has_commit "chat UI primitives (MessageBubble, Composer"; then
  echo "=== Task 6: mobile chat UI components ==="
  stage_and_commit "feat(mobile): chat UI primitives (MessageBubble, Composer, AttachmentSheet, VoiceButton, TypingIndicator)

$CO" mobile/src/components/chat/
fi

# === Task 7: mobile chat screens (replace placeholder index, add detail + new) ===
if ! has_commit "chat screens (list, detail, new chat)"; then
  echo "=== Task 7: mobile chat screens ==="
  stage_and_commit "feat(mobile): chat screens (list, streaming detail, new-chat assistant picker)

$CO" mobile/app/'(tabs)'/chat/index.tsx \
     mobile/app/'(tabs)'/chat/'[id]'.tsx \
     mobile/app/'(tabs)'/chat/new.tsx
fi

# === Task 8: Maestro chat E2E ===
if ! has_commit "Maestro E2E for chat"; then
  echo "=== Task 8: Maestro chat flow ==="
  stage_and_commit "test(mobile): Maestro E2E for chat (login → new chat → send → assert reply)

$CO" mobile/.maestro/chat-flow.yaml
fi

echo
echo "=== ALL DONE ==="
git log --oneline -16
