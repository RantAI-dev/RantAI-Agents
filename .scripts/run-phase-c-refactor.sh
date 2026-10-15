#!/usr/bin/env bash
# Refactors 9 Phase C routes to use getUserId. Idempotent: detects already-
# refactored files via the absence of `await auth()`.
set -euo pipefail
cd "$(dirname "$0")/.."

# Special-case: organizations GET takes no arg — patch first.
ORG_LIST=src/app/api/organizations/route.ts
if grep -q "export async function GET()" "$ORG_LIST"; then
  sed -i 's|export async function GET()|export async function GET(req: Request)|' "$ORG_LIST"
fi

# Files using `request:` param.
REQUEST_PARAM_FILES=(
  src/app/api/assistants/route.ts
  src/app/api/assistants/'[id]'/route.ts
  src/app/api/dashboard/files/route.ts
  src/app/api/dashboard/files/'[id]'/route.ts
)

# Files using `req:` param (or the patched org GET).
REQ_PARAM_FILES=(
  src/app/api/dashboard/digital-employees/route.ts
  src/app/api/dashboard/digital-employees/'[id]'/route.ts
  src/app/api/dashboard/audit/route.ts
  src/app/api/organizations/route.ts
  src/app/api/organizations/'[id]'/route.ts
)

for f in "${REQUEST_PARAM_FILES[@]}"; do
  if grep -q "await auth()" "$f"; then
    echo "Refactoring $f (request)"
    sed -i \
      -e 's|import { auth } from "@/lib/auth"|import { getUserId } from "@/lib/get-user-id"|' \
      -e 's|const session = await auth()|const userId = await getUserId(request)|g' \
      -e 's|if (!session?.user?.id)|if (!userId)|g' \
      -e 's|session\.user\.id|userId|g' \
      "$f"
  fi
done

for f in "${REQ_PARAM_FILES[@]}"; do
  if grep -q "await auth()" "$f"; then
    echo "Refactoring $f (req)"
    sed -i \
      -e 's|import { auth } from "@/lib/auth"|import { getUserId } from "@/lib/get-user-id"|' \
      -e 's|const session = await auth()|const userId = await getUserId(req)|g' \
      -e 's|if (!session?.user?.id)|if (!userId)|g' \
      -e 's|session\.user\.id|userId|g' \
      "$f"
  fi
done

# organizations/[id] uses `actorUserId: session.user.id` which is already covered.

echo "Refactor done. Verifying no auth() left in target files…"
remaining=0
for f in "${REQUEST_PARAM_FILES[@]}" "${REQ_PARAM_FILES[@]}"; do
  if grep -q "await auth()" "$f"; then
    echo "  STILL HAS auth(): $f"
    remaining=$((remaining + 1))
  fi
done
echo "remaining: $remaining"
