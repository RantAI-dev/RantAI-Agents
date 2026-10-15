#!/usr/bin/env bash
# Phase D + E polish/ship batch.
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

# === D.1: backend push sender + test ===
if ! has_commit "push sender (Expo Push"; then
  echo "=== Phase D.1: push sender ==="
  bunx vitest run tests/unit/push-sender.test.ts
  stage_and_commit "feat(push): push sender (Expo Push API wrapper) with DeviceNotRegistered cleanup + tests

$CO" src/lib/push/sender.ts tests/unit/push-sender.test.ts
fi

# === D.2: chat reply push trigger ===
if ! has_commit "push on assistant message append"; then
  echo "=== Phase D.2: chat reply push trigger ==="
  stage_and_commit "feat(push): fire push on assistant message append (fire-and-forget, dynamic import)

When a new assistant message is appended to a dashboard chat session, we
push the owner's mobile devices so the app can surface it even when the
stream isn't being watched. The import is dynamic so the chat service has
no hard dep on the push module (keeps existing test surfaces unchanged).

$CO" src/features/conversations/sessions/service.ts
fi

# === D.3: mobile deep links + notification handler ===
if ! has_commit "mobile deep links + notification handler"; then
  echo "=== Phase D.3: mobile deep links + notification handler ==="
  stage_and_commit "feat(mobile): deep links + notification tap handler

handleDeepLink() routes rantai:// URLs (conversation, assistant, digital-
employee, settings) to the matching Expo Router path. configureNotifications()
wires foreground banner behavior + tap-to-deep-link so push payloads with
{ data: { url: 'rantai://...' } } land the user on the right screen.

Root layout subscribes on mount, unsubscribes on unmount.

$CO" mobile/src/lib/deep-links.ts mobile/src/push/handler.ts mobile/app/_layout.tsx
fi

# === D.4: release doc ===
if ! has_commit "Phase E release guide"; then
  echo "=== Phase D.4: release doc ==="
  stage_and_commit "docs(mobile): Phase E release guide (EAS creds, APNs/FCM, universal links, submit)

$CO" mobile/RELEASE.md
fi

echo
echo "=== ALL DONE (Phase D) ==="
git log --oneline -12
