# Installing & Updating RantAI Agents

## Fresh install (one-liner)

    curl -fsSL https://raw.githubusercontent.com/RantAI-dev/RantAI-Agents/main/scripts/install.sh | bash

This:
- installs prerequisites (git, build-essential, rustup if needed)
- clones to `/opt/rantai-agents`
- builds the installer
- launches the TUI

The TUI then walks you through profile (`AppOnly`, `SidecarOnly`, `AllInOne`),
mode, and config. See `docs/superpowers/plans/2026-04-24-installer-v2.md` for
the profile design.

## Updating

Three equivalent ways:

1. **Re-run the curl bootstrap** — same one-liner above. Detects the existing
   install via `.git` and routes through update mode.

2. **`rantai-agents update`** — installed to `/usr/local/bin` during `Phase::Services`.

       sudo rantai-agents update           # update to latest main
       sudo rantai-agents update --branch v0.3.0   # pin to a release branch

3. **Re-run the installer binary** —

       sudo /opt/rantai-agents/installer/target/release/rantai-agents-installer

   The TUI shows the `UpdateOrFresh` screen because `/etc/rantai-agents/install.toml`
   exists.

What update does:
- `git stash --include-untracked` if local changes
- `git pull --ff-only origin <branch>`
- `git stash pop` (skipped + warned on conflict)
- `Phase::Dependencies` (idempotent)
- `Phase::Configuration` (skipped — your `.env` is preserved)
- `Phase::Database` (re-runs migrations; idempotent)
- `Phase::SidecarInstall` (`pip install -r requirements.txt`; HF cache hit)
- `Phase::Verification` (restarts services + `/health` checks)

## Diagnose

    sudo rantai-agents doctor

Walks `InstallState.sidecars`, runs `systemctl is-active` + `GET /health` per
service, prints pass/fail summary. Exit 0 on all-pass, 1 on any failure.

## Inspect

    rantai-agents version    # installer version + recorded install_state
    rantai-agents status     # profile + mode + service active states

## Pinning a version

Set `RANTAI_AGENTS_BRANCH` before running the bootstrap or pass `--branch`
to `rantai-agents update`. The installer remembers the branch in
`install.toml.git_sha` (short SHA only — branch name itself isn't stored,
re-passing `--branch` on each update is required).
