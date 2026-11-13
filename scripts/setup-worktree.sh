#!/usr/bin/env bash
# Makes a fresh checkout or worktree ready to work in. T3 Code runs it for every new worktree
# (see t3.json); a person runs it once after cloning. Safe to run again.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

git config core.hooksPath .githooks

# Worktrees do not get gitignored files. Link the env file from the main checkout instead of copying
# it, so there is one place to rotate a secret.
main_root="${T3CODE_PROJECT_ROOT:-$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')}"
for f in .env .env.local; do
  [ -e "$f" ] || { [ -f "$main_root/$f" ] && [ "$main_root" != "$PWD" ] && ln -s "$main_root/$f" "$f"; } || true
done

# A stale lockfile must fail here, not be rewritten by an agent halfway through a task.
# bun is the package manager (pnpm-lock.yaml is stale). --ignore-scripts: `canvas` needs the cairo
# dev libraries to build and nothing in the gate loads it; install them to run the full app.
[ -f bun.lock ]        && bun install --frozen-lockfile --ignore-scripts
[ -f uv.lock ]         && uv sync --frozen
[ -f rust/Cargo.toml ] && (cd rust && cargo fetch --locked)

echo "setup: ready"
