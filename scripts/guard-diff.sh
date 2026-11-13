#!/usr/bin/env bash
# What the lead runs on a worker's branch before reading a single line of the diff. It answers the
# questions a model reviewer is bad at and a script is perfect at: did the change stay in scope,
# did it touch something protected, and did it quietly weaken a gate?
#
#   scripts/guard-diff.sh <base-ref> [--scope '<regex of allowed paths>'] [--max-lines N]
#
# BLOCK findings fail the script. WARN findings are for the reviewer to judge.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

base="${1:?usage: scripts/guard-diff.sh <base-ref> [--scope '<regex>'] [--max-lines N]}"; shift
scope=""; max_lines=600
while [ $# -gt 0 ]; do
  case "$1" in
    --scope) scope="$2"; shift 2 ;;
    --max-lines) max_lines="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
git rev-parse --verify -q "$base" >/dev/null || { echo "guard: base ref '$base' not found" >&2; exit 2; }

blocks=0; warns=0
block() { echo "BLOCK $1"; blocks=$((blocks + 1)); }
warn()  { echo "WARN  $1"; warns=$((warns + 1)); }

test_file='(\.|_)(test|spec)\.[a-z]+$|(^|/)tests?/|(^|/)test_[^/]+\.py$|_test\.(go|rs|py)$'
test_decl='^\s*((test|it|describe)(\.each)?\(|#\[(tokio::)?test|def test_|func Test)'
skip_pat='\.(skip|only|todo)\(|\b(xit|xdescribe|xtest)\(|#\[ignore|@pytest\.mark\.(skip|xfail)|\bt\.Skip\('
suppress_pat='(eslint|oxlint)-disable|biome-ignore|@ts-(ignore|expect-error|nocheck)|#!?\[allow\(|# *type: *ignore|# *noqa|\bas any\b|--no-verify'
secret_pat='AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{24,}|\bghp_[A-Za-z0-9]{36}|\bxox[baprs]-[A-Za-z0-9-]{10,}'
deps_file='(^|/)(package\.json|bun\.lock|pnpm-lock\.yaml|package-lock\.json|Cargo\.toml|Cargo\.lock|pyproject\.toml|uv\.lock|requirements[^/]*\.txt|go\.(mod|sum))$'

changed="$(git diff --name-only "$base" HEAD)"
[ -z "$changed" ] && { echo "guard: no committed changes since $base"; exit 1; }

# 1. Scope
if [ -n "$scope" ]; then
  while IFS= read -r f; do [ -n "$f" ] && block "scope: $f is outside the brief's scope"; done \
    < <(printf '%s\n' "$changed" | grep -Ev "$scope" || true)
fi

# 2. Protected paths (one regex per line in .agents/protected-paths)
if [ -f .agents/protected-paths ]; then
  while IFS= read -r pat; do
    case "$pat" in ''|'#'*) continue ;; esac
    while IFS= read -r f; do [ -n "$f" ] && block "protected: $f matches '$pat' (needs the owner's sign-off)"; done \
      < <(printf '%s\n' "$changed" | grep -E "$pat" || true)
  done < .agents/protected-paths
fi

# 3. Tests deleted or thinned
while IFS= read -r f; do [ -n "$f" ] && block "tests: $f was deleted"; done \
  < <(git diff --name-only --diff-filter=D "$base" HEAD | grep -E "$test_file" || true)
while IFS= read -r f; do
  [ -n "$f" ] || continue
  removed=$(git diff -U0 "$base" HEAD -- "$f" | grep -E '^-' | grep -Ev '^---' | sed 's/^-//' | grep -Ec "$test_decl" || true)
  added=$(git diff -U0 "$base" HEAD -- "$f" | grep -E '^\+' | grep -Ev '^\+\+\+' | sed 's/^+//' | grep -Ec "$test_decl" || true)
  [ "$removed" -gt "$added" ] && block "tests: $f lost $((removed - added)) test case(s)"
done < <(git diff --name-only --diff-filter=M "$base" HEAD | grep -E "$test_file" || true)

# 4-6. Added lines: skips, suppressions, secrets
while IFS= read -r line; do
  loc="${line%%$'\t'*}"; text="${line#*$'\t'}"
  if   printf '%s' "$text" | grep -Eq "$secret_pat";   then block "secret: $loc looks like a credential"
  elif printf '%s' "$text" | grep -Eq "$skip_pat";     then block "skip: $loc: $(printf '%s' "$text" | cut -c1-100)"
  elif printf '%s' "$text" | grep -Eq "$suppress_pat"; then warn  "suppression: $loc: $(printf '%s' "$text" | cut -c1-100)"
  fi
done < <(git diff -U0 "$base" HEAD | awk '
  /^\+\+\+ /        { file = substr($0, 7); next }
  /^@@ /            { split($3, a, ","); n = substr(a[1], 2) + 0; next }
  /^\+/             { printf "%s:%d\t%s\n", file, n, substr($0, 2); n++ }')

# 7. Dependencies
while IFS= read -r f; do [ -n "$f" ] && warn "deps: $f changed — a new dependency needs the owner's approval"; done \
  < <(printf '%s\n' "$changed" | grep -E "$deps_file" || true)

# 8. Size
lines=$(git diff --numstat "$base" HEAD | awk '$1 != "-" { s += $1 + $2 } END { print s + 0 }')
[ "$lines" -gt "$max_lines" ] && warn "size: $lines changed lines (limit $max_lines) — review quality drops on large diffs; split it"

# 9. Uncommitted work
[ -n "$(git status --porcelain)" ] && warn "dirty: uncommitted changes are not part of what you are reviewing"

echo "guard: $blocks block, $warns warn ($(printf '%s\n' "$changed" | wc -l | tr -d ' ') files, $lines lines)"
[ "$blocks" -eq 0 ]
