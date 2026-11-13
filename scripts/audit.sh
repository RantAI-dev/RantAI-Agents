#!/usr/bin/env bash
# Measures an existing repository against the guidelines and prints the gaps, in the order to close
# them. It reads only: nothing in the target is changed. Reading is done here, by a script, so that
# no model has to spend tokens finding out what state a repository is in.
#
#   scripts/audit.sh [/path/to/repo]      (default: the current repository)
set -uo pipefail
repo="${1:-.}"
cd "$repo" && git rev-parse --git-dir >/dev/null 2>&1 || { echo "not a git repository: $repo" >&2; exit 2; }
cd "$(git rev-parse --show-toplevel)"

gaps=0
pass() { echo "PASS  $1"; }
gap()  { echo "GAP   $1"; gaps=$((gaps + 1)); }
info() { echo "INFO  $1"; }
count() { bash -c "$1" 2>/dev/null | tr -dc '0-9' | sed 's/^$/0/'; }
has() { [ "$(git ls-files -- "$@" | head -1)" != "" ]; }

echo "== 1. Instructions every harness reads"
if [ -f AGENTS.md ]; then
  n=$(wc -l < AGENTS.md)
  [ "$n" -le 200 ] && pass "AGENTS.md exists, $n lines" || gap "AGENTS.md is $n lines; the budget is 200. Move detail into docs/ or a skill."
  grep -q 'TODO(fill)' AGENTS.md && gap "AGENTS.md still has TODO(fill) lines"
  grep -qiE 'check\.sh|bun run|cargo |pytest|npm run|make ' AGENTS.md || gap "AGENTS.md names no command to run the checks"
else gap "no AGENTS.md. Workers on OpenCode and Antigravity have no instructions at all."; fi
if [ -f CLAUDE.md ]; then
  grep -q '^@AGENTS.md' CLAUDE.md && pass "CLAUDE.md imports AGENTS.md" || gap "CLAUDE.md has its own content. Move it into AGENTS.md and leave one line: @AGENTS.md"
fi
[ -d .claude/rules ] && gap ".claude/rules/ exists. Only Claude Code reads it; move what workers need into AGENTS.md."
if [ -d .agents/skills ]; then
  [ -L .claude/skills ] && pass "skills in .agents/skills, linked for Claude Code" || gap ".agents/skills exists but .claude/skills is not a symlink to it"
elif [ -d .claude/skills ]; then gap "skills live only in .claude/skills. Move them to .agents/skills and symlink."; fi

echo "== 2. The gate"
[ -x scripts/check.sh ] && pass "scripts/check.sh" || gap "no scripts/check.sh: there is no single command that means green"
[ -x scripts/guard-diff.sh ] && pass "scripts/guard-diff.sh" || gap "no scripts/guard-diff.sh: nothing checks a worker's scope or protected paths"
[ -f .agents/protected-paths ] && pass ".agents/protected-paths" || gap "no .agents/protected-paths: a worker can edit the tests and configs that define done"
[ -n "$(git config core.hooksPath || true)" ] || [ -f .git/hooks/pre-commit ] || has lefthook.yml .husky/pre-commit .pre-commit-config.yaml \
  && pass "a pre-commit hook is configured" || gap "no pre-commit hook"
if has '.github/workflows/*' '.gitlab-ci.yml'; then
  git grep -qE 'check\.sh' -- '.github/workflows' '.gitlab-ci.yml' 2>/dev/null && pass "CI runs scripts/check.sh" || gap "CI does not call scripts/check.sh, so green locally and green in CI can differ"
  git grep -qE 'timeout-minutes' -- '.github/workflows' 2>/dev/null && pass "CI jobs have a time limit" \
    || gap "CI jobs have no timeout-minutes: nothing stops the gate getting slower (the budget is 15 minutes)"
else gap "no CI workflow"; fi
[ -f docs/conventions.md ] && [ -f .agents/error-codes.tsv ] && [ -x scripts/error-codes.sh ] \
  && pass "conventions and the error-code registry" \
  || gap "no docs/conventions.md or .agents/error-codes.tsv: error bodies, statuses and codes are whatever each handler chose"
if [ -f .agents/error-codes.tsv ]; then
  grep -q '^@emit ' .agents/error-codes.tsv && pass "error codes are generated into the source" \
    || gap "no @emit line in .agents/error-codes.tsv: the code cannot be checked against the registry (skip if this repository returns no errors over a network)"
fi
has CODEOWNERS .github/CODEOWNERS docs/CODEOWNERS && pass "CODEOWNERS" || gap "no CODEOWNERS for the protected paths"

echo "== 3. Tests"
src=$(git ls-files '*.ts' '*.tsx' '*.rs' '*.py' '*.go' | grep -Ev '(\.|_)(test|spec)\.|(^|/)tests?/|\.d\.ts$' | wc -l)
tests=$(git ls-files | grep -E '(\.|_)(test|spec)\.[a-z]+$|(^|/)tests?/.*\.(ts|tsx|rs|py|go)$|(^|/)test_[^/]+\.py$' | wc -l)
info "$src source files, $tests test files"
[ "$src" -gt 20 ] && [ "$tests" -eq 0 ] && gap "no tests. Write characterization tests for an area before you change it."
skips=$(count "git grep -nE '\\.(skip|only)\\(|#\\[ignore|@pytest\\.mark\\.(skip|xfail)' -- ':!scripts/guard-diff.sh' ':!*.md' | wc -l")
[ "$skips" -gt 0 ] && gap "$skips skipped or focused tests" || pass "no skipped tests"

echo "== 4. Code"
metrics=()
metric() {  # name, command, what it means
  local n; n=$(count "$2")
  if [ "$n" -gt 0 ]; then gap "$3: $n"; metrics+=("$1"$'\t'"$2"); else pass "$3: 0"; fi
}
if has '*.ts' '*.tsx'; then
  metric ts-any          "git grep -nE ':[[:space:]]*any\\b|\\bas any\\b' -- '*.ts' '*.tsx' ':!*.d.ts' | wc -l" "TypeScript: uses of any"
  metric ts-suppress     "git grep -nE '@ts-(ignore|expect-error|nocheck)|(eslint|oxlint)-disable|biome-ignore' -- '*.ts' '*.tsx' | wc -l" "TypeScript: suppressions"
  git grep -qE '\"strict\"[[:space:]]*:[[:space:]]*true' -- '*tsconfig*.json' 2>/dev/null && pass "TypeScript: strict mode on" || gap "TypeScript: strict mode is not on"
fi
if has '*.rs'; then
  metric rust-unwrap     "git grep -nE '\\.(unwrap|expect)\\(' -- '*.rs' ':!tests/*' ':!*/tests/*' ':!*/benches/*' | wc -l" "Rust: unwrap/expect outside tests/ (test modules inside src are counted too)"
  metric rust-allow      "git grep -nE '#!?\\[allow\\(' -- '*.rs' | grep -vc reason" "Rust: allow attributes without a reason"
  has Cargo.lock '*/Cargo.lock' && pass "Rust: Cargo.lock committed" || gap "Rust: Cargo.lock is not committed"
  git grep -qE 'unwrap_used' -- '*Cargo.toml' 'clippy.toml' 2>/dev/null && pass "Rust: clippy denies unwrap in Cargo.toml" || gap "Rust: lints are not in Cargo.toml (see stacks/rust/lints.toml)"
fi
if has '*.py'; then
  metric py-bare-suppress "git grep -nE '#[[:space:]]*noqa[[:space:]]*\$|#[[:space:]]*type:[[:space:]]*ignore[[:space:]]*\$' -- '*.py' | wc -l" "Python: bare noqa / type: ignore"
  metric py-bare-except   "git grep -nE '^[[:space:]]*except[[:space:]]*:' -- '*.py' | wc -l" "Python: bare except"
fi
metric todo-no-link "git grep -nE '\\b(TODO|FIXME|HACK|XXX)\\b' -- '*.ts' '*.tsx' '*.rs' '*.py' '*.go' | grep -vcE '#[0-9]+|https?://'" "TODO/FIXME without an issue link"
if [ -x scripts/file-size.sh ]; then
  big=$(scripts/file-size.sh --list | grep -c $'\t' || true)
  frozen=$( [ -f .agents/size-baseline.tsv ] && wc -l < .agents/size-baseline.tsv | tr -d ' ' || echo 0)
  if [ "$big" -eq 0 ]; then pass "no source file over the size limit"
  elif [ "$frozen" -ge "$big" ]; then pass "$big oversized file(s), all frozen so they can only shrink"
  else gap "$big source file(s) over the size limit and not frozen. Run scripts/file-size.sh --update"; fi
else
  big=$(count "git ls-files '*.ts' '*.tsx' '*.rs' '*.py' '*.go' | grep -Ev '(\\.|_)(test|spec)\\.|\\.d\\.ts\$' | xargs -r wc -l | awk '\$2 != \"total\" && \$1 > 600' | wc -l")
  [ "$big" -gt 0 ] && gap "$big source file(s) over 600 lines, and no scripts/file-size.sh to stop them growing" || pass "no source file over 600 lines"
fi
echo "INFO  largest source files:"
git ls-files '*.ts' '*.tsx' '*.rs' '*.py' '*.go' | grep -Ev '(\.|_)(test|spec)\.|\.d\.ts$' | xargs -r wc -l 2>/dev/null | awk '$2 != "total"' | sort -rn | head -5 | sed 's/^/        /'

echo "== 5. Harness permissions and worktrees"
[ -f .claude/settings.json ] && grep -q '"deny"' .claude/settings.json && pass ".claude/settings.json has a deny list" || gap "no deny list in .claude/settings.json"
has opencode.json opencode.jsonc && pass "opencode.json" || gap "no opencode.json: OpenCode workers have no deny list here"
[ -f t3.json ] && grep -q runOnWorktreeCreate t3.json && pass "t3.json sets up new worktrees" || gap "no t3.json worktree setup: each worker starts in an unprepared checkout"

echo
echo "audit: $gaps gap(s) in $(basename "$PWD")"
if [ "${#metrics[@]}" -gt 0 ]; then
  echo
  echo "Ratchet lines for .agents/ratchet.tsv (the counts above become the baseline):"
  printf '%s\n' "${metrics[@]}"
fi
cat <<'NEXT'

Close the gaps in this order. Each step is one small pull request.
  1. Install the template (the guidelines repo, scripts/adopt.sh), fill in AGENTS.md by hand.
  2. Make scripts/check.sh pass on the code as it is: configure it, do not fix code yet.
  3. Paste the ratchet lines, run scripts/ratchet.sh --update and scripts/file-size.sh --update,
     commit. The counts and the oversized files can now only shrink.
  4. List the protected paths. Turn on the hook and CI.
  5. Only then refactor, one area at a time, starting where the next feature will land.
NEXT
exit 0
