#!/usr/bin/env bash
# The one gate. People, agents, the pre-commit hook and CI all run this file, so "green" means the
# same thing everywhere. Edit the CONFIGURE block for this repo and leave the interface alone.
#
#   scripts/check.sh                  every part (CI on main, nightly, and before a release)
#   scripts/check.sh --changed        only the parts the files changed since the merge base can affect
#   scripts/check.sh --staged         fast format and lint for staged files (pre-commit)
#   scripts/check.sh --plan [--changed]   print the parts that would run, as a JSON list (CI matrix)
#   scripts/check.sh --part NAME      run one part; "repo" is the checks for the whole repository
#
# Passing steps print one line. A failing step prints the tail of its output, because an agent
# reads every line this script prints.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

# ---- CONFIGURE ----------------------------------------------------------------------------------
BASE_REF="${CHECK_BASE:-origin/main}"
TAIL_LINES="${CHECK_TAIL:-60}"
# Time budgets in seconds, for a run with warm caches. Over budget prints a SLOW line and does not
# fail here, because a busy machine would make that flaky; CI enforces its own limit with
# timeout-minutes. Lower them if you can. Raising one is the owner's decision.
BUDGET_FULL="${CHECK_BUDGET_FULL:-600}"
BUDGET_CHANGED="${CHECK_BUDGET_CHANGED:-120}"
BUDGET_STAGED="${CHECK_BUDGET_STAGED:-15}"

# Parts. A part is a set of files and the checks that can break when they change: a whole stack to
# start with, later one crate or package group each, so a change rebuilds and tests only its part.
# For each name in PARTS define <name>_paths (an extended regex over repository paths), <name>_full
# and <name>_fast. Delete the parts this repo does not have.
# ts: the Next.js app. Tests need Postgres: set DATABASE_URL to a throwaway database with
# `bunx prisma migrate deploy` applied (258 files / 1933 tests pass that way; 13 fail without it).
# `bun run lint` is not in the gate: eslint is not a dependency here, so the script exits 127.
# Exit condition: add eslint to devDependencies with a flat config, then add `bun run lint` below.
ts_paths='^(src|tests|scripts|prisma|server\.ts)|(^|/)(package\.json|bun\.lock|tsconfig[^/]*\.json|vitest\.config\.ts)$'
ts_full()  { bun run check:thin-routes && bun run check:kb-boundary && bun run check:domain-imports && bun run check:frontend-compliance && bunx vitest run; }
ts_fast()  { :; }

# rust: the Rust port (docs/port/plan.md). The whole workspace is one part until it has more crates.
rust_paths='^rust/'
# agents-store tests use TEST_DATABASE_URL (a migrated database); they skip locally without it
# and fail in CI without it.
rust_full() { (cd rust && TEST_DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-}}" && export TEST_DATABASE_URL && cargo fmt --check && cargo clippy --workspace --all-targets --locked -- -D warnings && cargo test --workspace --locked); }
rust_fast() { (cd rust && cargo fmt --check); }

PARTS=(ts rust)

# A changed file here can affect every part, so --changed runs all of them.
ALL_PATHS='^scripts/|^\.github/|^\.agents/|^\.githooks/|^\.env\.example$|(^|/)Dockerfile|^compose|^migrations/'
# A changed file here affects no part (the repository checks still run).
NO_PATHS='\.md$|^docs/|^LICENSE|^\.gitignore$|^\.claude/|^\.opencode/|^opencode\.json$|^t3\.json$'
# Any other file that no part claims selects every part: an unknown path means everything.
# -------------------------------------------------------------------------------------------------

mode=full; plan=0; only=""
while [ $# -gt 0 ]; do
  case "$1" in
    --changed) mode=changed ;;
    --staged)  mode=staged ;;
    --plan)    plan=1 ;;
    --part)    only="${2:-}"; [ -n "$only" ] || { echo "check: --part needs a name" >&2; exit 2; }; shift ;;
    *) echo "usage: scripts/check.sh [--changed|--staged] [--plan] [--part NAME]" >&2; exit 2 ;;
  esac
  shift
done

for part in "${PARTS[@]}"; do  # a part with a missing piece would be skipped without a word
  var="${part}_paths"
  [ -n "${!var:-}" ] && declare -F "${part}_full" >/dev/null && declare -F "${part}_fast" >/dev/null \
    || { echo "check: part $part needs ${part}_paths, ${part}_full and ${part}_fast in the CONFIGURE block" >&2; exit 2; }
done
if [ -n "$only" ] && [ "$only" != repo ] && [[ " ${PARTS[*]} " != *" $only "* ]]; then
  echo "check: no part named $only (parts: ${PARTS[*]} repo)" >&2; exit 2
fi

files=""
if [ "$mode" = changed ]; then
  if base="$(git merge-base HEAD "$BASE_REF" 2>/dev/null)"; then
    files="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)"
  else
    echo "check: cannot find the merge base with $BASE_REF, so every part runs" >&2; mode=full
  fi
elif [ "$mode" = staged ]; then
  files="$(git diff --cached --name-only --diff-filter=ACMR)"
fi

# Which parts run. In --changed mode this fails closed: a shared or unknown file selects them all.
# Not `grep -q`: it exits on the first match, git ls-files then dies of SIGPIPE, and pipefail turns a
# match into a failure, so on a large repository every part was skipped without a word.
present() { local var="$1_paths"; git ls-files | grep -E "${!var}" >/dev/null; }
claims()  { local var="$1_paths"; printf '%s\n' "$2" | grep -E "${!var}" >/dev/null; }
selected=()
if [ "$mode" = changed ]; then
  every=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if printf '%s\n' "$f" | grep -E "$ALL_PATHS" >/dev/null; then every=1; break; fi
    hit=0; for part in "${PARTS[@]}"; do claims "$part" "$f" && hit=1; done
    [ "$hit" -eq 1 ] && continue
    printf '%s\n' "$f" | grep -E "$NO_PATHS" >/dev/null && continue
    echo "check: no part claims $f, so every part runs. Add it to a part, ALL_PATHS or NO_PATHS." >&2
    every=1; break
  done <<<"$files"
  for part in "${PARTS[@]}"; do
    if [ "$every" -eq 1 ]; then present "$part" && selected+=("$part")
    elif printf '%s\n' "$files" | grep -E "$(v="${part}_paths"; echo "${!v}")" >/dev/null; then selected+=("$part"); fi
  done
else
  for part in "${PARTS[@]}"; do
    if [ "$mode" = staged ]; then claims "$part" "$files" && selected+=("$part")
    else present "$part" && selected+=("$part"); fi
  done
fi
[ -n "$only" ] && { [ "$only" = repo ] && selected=() || selected=("$only"); }

if [ "$plan" -eq 1 ]; then
  printf '["repo"'; for part in "${selected[@]}"; do printf ',"%s"' "$part"; done; printf ']\n'; exit 0
fi

log="$(mktemp)"; trap 'rm -f "$log"' EXIT
ran=(); failed=()
for part in "${selected[@]}"; do
  fn="${part}_full"; [ "$mode" = staged ] && fn="${part}_fast"
  start=$SECONDS
  if "$fn" >"$log" 2>&1; then
    echo "check: $part ok ($((SECONDS - start))s)"
  else
    echo "check: $part FAILED ($((SECONDS - start))s) — last $TAIL_LINES lines:"
    tail -n "$TAIL_LINES" "$log"
    failed+=("$part")
  fi
  ran+=("$part")
done

# The checks for the whole repository: always, unless one other part was asked for.
if [ -z "$only" ] || [ "$only" = repo ]; then
  # File size: a source file over the limit fails; one already over it may only shrink. Always runs.
  if [ -x scripts/file-size.sh ]; then
    if scripts/file-size.sh >"$log" 2>&1; then echo "check: size ok"; else cat "$log"; failed+=("size"); fi
    ran+=("size")
  fi

  # Error codes: the registry is valid, published codes are unchanged, generated files are current.
  if [ -x scripts/error-codes.sh ] && [ -f .agents/error-codes.tsv ]; then
    if scripts/error-codes.sh >"$log" 2>&1; then echo "check: errors ok"; else cat "$log"; failed+=("errors"); fi
    ran+=("errors")
  fi

  # The ratchet: counts that may fall but never rise. Skipped in the fast pre-commit mode.
  if [ "$mode" != staged ] && [ -x scripts/ratchet.sh ] && grep -qEv '^[[:space:]]*(#|$)' .agents/ratchet.tsv 2>/dev/null; then
    if scripts/ratchet.sh >"$log" 2>&1; then echo "check: ratchet ok"; else cat "$log"; failed+=("ratchet"); fi
    ran+=("ratchet")
  fi
fi

if [ "${#ran[@]}" -eq 0 ]; then echo "check: nothing to run ($mode)"; exit 0; fi
total=$SECONDS
case "$mode" in changed) budget=$BUDGET_CHANGED ;; staged) budget=$BUDGET_STAGED ;; *) budget=$BUDGET_FULL ;; esac
if [ "$total" -gt "$budget" ]; then
  echo "check: SLOW ($mode took ${total}s; the budget is ${budget}s). The slowest step is in the lines above."
  echo "       Make it faster by caching, by splitting a crate or package so less is rebuilt, or by asking the"
  echo "       owner to move a slow suite to the nightly job. Never by removing or skipping a test. Report it in your handoff."
fi
if [ "${#failed[@]}" -gt 0 ]; then echo "check: FAIL (${failed[*]}; $mode; ${total}s)"; exit 1; fi
echo "check: PASS (${ran[*]}; $mode; ${total}s)"
