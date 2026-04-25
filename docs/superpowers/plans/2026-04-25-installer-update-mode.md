# Installer Update Mode (Hermes-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RantAI-Agents trivially updatable — single-command install AND update via `curl ... | bash` and `rantai-agents update`, mirroring the hermes-agent pattern. Adds install-state persistence, an update flow inside the existing TUI installer, a small `rantai-agents` CLI binary with `update` / `doctor` / `status` / `version` subcommands, and a curl bootstrap script.

**Architecture:** Add an `InstallState` TOML file at `/etc/rantai-agents/install.toml` recording profile/mode/install_dir/git_sha/version. The installer reads it on startup; if present, it runs in **update mode** (skips preflight that's redundant, runs `git pull --ff-only` with auto-stash, re-runs `Phase::Dependencies` + `Phase::Database` + `Phase::SidecarInstall` + `Phase::Verification`, refreshes the state file). A new sibling Rust binary `rantai-agents` (built from the same crate via a second `[[bin]]`) reuses the executor + verify logic to expose `rantai-agents update` (= re-run installer non-interactively) and `rantai-agents doctor` (= run verify-only) as one-liners. A `scripts/install.sh` curl bootstrap downloads the latest release / builds from source and invokes the installer.

**Tech Stack:**
- Rust + Ratatui (existing installer crate)
- `clap` 4 with `derive` feature (already in Cargo.toml)
- `toml` 0.8 + `serde` (toml is new; serde already present)
- `dirs` 5 (new — for `~/.config` paths in fallback when not root)
- bash for the curl bootstrap

---

## Pre-read

Before writing code, read:

- `installer/src/installer/executor.rs` — `run_installation`, `execute_phase`, `should_skip_phase`. The update flow is going to drive this same function with a different config + skip mask.
- `installer/src/installer/services.rs` — systemd unit install pattern; the `rantai-agents` CLI binary should also be installed to `/usr/local/bin/` for shell-PATH access.
- `installer/src/installer/mod.rs` — helpers `run_command`, `run_sudo`, `command_exists`, `is_root`, `generate_random_string`.
- `installer/src/app.rs` — `InstallConfig`, `InstallProfile`, `Phase` types added in installer-v2.
- `installer/Cargo.toml` — see how `[[bin]]` is currently declared.
- `https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh` — the reference pattern for the curl bootstrap.
- The user's workflow memory: `git commit-sulthan` alias, atomic commits, no `Co-Authored-By`, no mid-bullet wrapping, never commit Claude config files.

**Branch:** Continue on `feat/installer-v2`. The update flow is a natural extension of the profile-aware installer; keeping it on the same branch lets both ship together.

---

## File Structure

**New files:**
- `installer/src/state.rs` — `InstallState` struct + TOML read/write at `/etc/rantai-agents/install.toml` (root) or `~/.config/rantai-agents/install.toml` (non-root)
- `installer/src/installer/update.rs` — git auto-stash + `git pull --ff-only` + restore stash; helper consumed by both the TUI update flow and the CLI `update` subcommand
- `installer/src/bin/rantai-agents.rs` — second binary entry point for the CLI
- `installer/src/cli/mod.rs` — clap subcommand definitions
- `installer/src/cli/update.rs` — `update` subcommand handler
- `installer/src/cli/doctor.rs` — `doctor` subcommand handler
- `installer/src/cli/status.rs` — `status` subcommand handler
- `installer/src/cli/version.rs` — `version` subcommand handler
- `scripts/install.sh` — bash bootstrap script (curl ... | bash)
- `installer/tests/state_roundtrip.rs` — TOML serialization tests
- `installer/tests/update_detection.rs` — installer detects existing state
- `installer/tests/cli_parse.rs` — clap subcommand parsing
- `docs/INSTALL.md` — install + update operator guide

**Modified files:**
- `installer/Cargo.toml` — add second `[[bin]]` for `rantai-agents`, add `toml` + `dirs` deps
- `installer/src/lib.rs` — `pub mod state;`, `pub mod cli;`
- `installer/src/installer/mod.rs` — `pub mod update;`
- `installer/src/main.rs` — read `InstallState` on startup; if present, route to update flow (new `Screen::UpdateOrFresh` confirmation) before normal flow
- `installer/src/app.rs` — add `Screen::UpdateOrFresh` variant; add `pub update_mode: bool` flag on `App`; add `pub install_state: Option<InstallState>`
- `installer/src/installer/executor.rs` — when `config.update_mode == true`, swap the phase list to update-only set (Dependencies, Database, SidecarInstall, Verification)
- `installer/src/installer/config.rs` — `generate_config` (writes `.env`): in update mode, NEVER overwrite existing `.env` (back it up + skip), only refresh keys that were added in the new release
- `installer/src/installer/services.rs` — also install the `rantai-agents` CLI binary to `/usr/local/bin/rantai-agents` during the Services phase
- `installer/src/ui/screens/mod.rs` — register `update_or_fresh` screen
- `installer/src/ui/screens/update_or_fresh.rs` (new) — TUI screen that asks "Update existing install? [Yes/Fresh install/Cancel]"

---

## Phase Layout (shippable checkpoints)

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| H. State persistence | 1–4 | `InstallState` reads/writes to TOML; installer can detect "already installed" |
| I. TUI update flow | 5–9 | UpdateOrFresh screen + update-mode executor branch + git pull with stash |
| J. CLI binary | 10–15 | `rantai-agents update`/`doctor`/`status`/`version` work end-to-end |
| K. Curl bootstrap + docs | 16–19 | `scripts/install.sh`; `docs/INSTALL.md` shows the one-line install + update commands |

**MVP boundary:** Phases H–I alone deliver "operator re-runs the installer to update" — same pattern as hermes-agent's `install.sh` re-run path. Phase J adds the friendlier `rantai-agents update` shortcut. Phase K is the public-facing one-liner.

---

## Task 1: `InstallState` type

**Files:**
- Create: `installer/src/state.rs`
- Modify: `installer/src/lib.rs` — add `pub mod state;`
- Modify: `installer/Cargo.toml` — add `toml = "0.8"` and `dirs = "5"`
- Create: `installer/tests/state_roundtrip.rs`

- [ ] **Step 1: Add deps**

In `installer/Cargo.toml` under `[dependencies]`:

```toml
toml = "0.8"
dirs = "5"
```

Run `cargo build --release` once to fetch them.

- [ ] **Step 2: Write the failing test**

Create `installer/tests/state_roundtrip.rs`:

```rust
use rantai_agents_installer::app::{InstallProfile, InstallMode};
use rantai_agents_installer::state::InstallState;

#[test]
fn install_state_roundtrip_via_toml() {
    let s = InstallState {
        profile: InstallProfile::AllInOne,
        mode: InstallMode::Full,
        install_dir: "/opt/rantai-agents".into(),
        data_dir: "/var/lib/rantai-agents".into(),
        git_sha: "abc1234".into(),
        installer_version: env!("CARGO_PKG_VERSION").to_string(),
        installed_at: "2026-04-25T10:00:00Z".into(),
        sidecars: vec!["mineru".into(), "rerank".into()],
    };
    let serialized = s.to_toml().unwrap();
    let back = InstallState::from_toml(&serialized).unwrap();
    assert_eq!(back.profile, InstallProfile::AllInOne);
    assert_eq!(back.mode, InstallMode::Full);
    assert_eq!(back.install_dir, "/opt/rantai-agents");
    assert_eq!(back.git_sha, "abc1234");
    assert_eq!(back.sidecars, vec!["mineru", "rerank"]);
}

#[test]
fn install_state_default_path_for_root_is_etc() {
    let p = InstallState::default_path(true);
    assert_eq!(p.to_string_lossy(), "/etc/rantai-agents/install.toml");
}

#[test]
fn install_state_default_path_for_non_root_is_xdg() {
    let p = InstallState::default_path(false);
    let s = p.to_string_lossy();
    // ~/.config/rantai-agents/install.toml — but ~ resolved
    assert!(s.contains(".config/rantai-agents/install.toml"), "got {s}");
}

#[test]
fn install_state_load_returns_none_when_missing() {
    let nonexistent = std::path::PathBuf::from("/tmp/definitely-not-a-real-installer-state-{}.toml")
        .with_file_name(format!("rantai-state-{}.toml", std::process::id()));
    assert!(InstallState::load_from(&nonexistent).unwrap().is_none());
}
```

- [ ] **Step 3: Verify failure**

Run: `cd installer && cargo test --test state_roundtrip`

Expected: fails to compile — `InstallState` not found.

- [ ] **Step 4: Implement `state.rs`**

Create `installer/src/state.rs`:

```rust
//! Persisted record of an existing install. Written to /etc/rantai-agents/install.toml
//! (root) or ~/.config/rantai-agents/install.toml (non-root) at the end of every
//! successful install/update. Used by the installer + `rantai-agents` CLI to
//! decide whether to enter update mode.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::app::{InstallMode, InstallProfile};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallState {
    pub profile: InstallProfile,
    pub mode: InstallMode,
    pub install_dir: String,
    pub data_dir: String,
    /// Short SHA of the git commit at install_dir at install time.
    pub git_sha: String,
    /// `CARGO_PKG_VERSION` of the installer that wrote this file.
    pub installer_version: String,
    /// ISO-8601 UTC timestamp.
    pub installed_at: String,
    /// Names of sidecar systemd units installed (e.g. ["mineru", "rerank"]).
    pub sidecars: Vec<String>,
}

impl InstallState {
    pub fn to_toml(&self) -> Result<String, String> {
        toml::to_string_pretty(self).map_err(|e| format!("toml serialize: {e}"))
    }

    pub fn from_toml(s: &str) -> Result<Self, String> {
        toml::from_str(s).map_err(|e| format!("toml parse: {e}"))
    }

    pub fn default_path(is_root: bool) -> PathBuf {
        if is_root {
            PathBuf::from("/etc/rantai-agents/install.toml")
        } else {
            let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from(".config"));
            p.push("rantai-agents");
            p.push("install.toml");
            p
        }
    }

    /// Returns Ok(None) if the file doesn't exist; Err on parse / IO failure.
    pub fn load_from(path: &Path) -> Result<Option<Self>, String> {
        if !path.exists() {
            return Ok(None);
        }
        let s = std::fs::read_to_string(path).map_err(|e| format!("read {path:?}: {e}"))?;
        Ok(Some(Self::from_toml(&s)?))
    }

    pub fn save_to(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir {parent:?}: {e}"))?;
        }
        let s = self.to_toml()?;
        std::fs::write(path, s).map_err(|e| format!("write {path:?}: {e}"))
    }
}
```

For the `Serialize`/`Deserialize` derives to work on `InstallProfile` and `InstallMode`, those enums must derive `Serialize, Deserialize`. Add them in `installer/src/app.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum InstallProfile { /* unchanged */ }

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum InstallMode { /* unchanged */ }
```

`serde` is already a dep (used by reqwest); confirm via `cargo tree -i serde` or just check `Cargo.toml`.

In `installer/src/lib.rs`, add:

```rust
pub mod state;
```

- [ ] **Step 5: Verify tests pass**

Run: `cd installer && cargo test --test state_roundtrip`

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```
feat(installer): InstallState — persisted install record (TOML)

- /etc/rantai-agents/install.toml (root) or ~/.config/rantai-agents/install.toml
- captures profile, mode, install/data dir, git sha, installer version, installed sidecars
- load_from returns None when missing (fresh install signal)
- 4 unit tests cover roundtrip + path defaults + missing-file behaviour
```

---

## Task 2: Write `InstallState` at the end of a successful install

**Files:**
- Modify: `installer/src/installer/executor.rs` — after `Phase::Verification`, write the state file
- Modify: `installer/src/installer/mod.rs` — expose a `current_git_sha(install_dir: &str) -> String` helper

- [ ] **Step 1: Add the helper**

In `installer/src/installer/mod.rs`, after the existing helpers:

```rust
/// Returns the short SHA of HEAD inside `install_dir`, or "unknown" if git fails.
pub fn current_git_sha(install_dir: &str) -> String {
    use std::process::Command;
    Command::new("git")
        .args(["-C", install_dir, "rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string())
}
```

- [ ] **Step 2: Write state at install completion**

In `installer/src/installer/executor.rs::run_installation`, after the final `tx.send(InstallMessage::Done(Ok(()))).await.ok();` — actually, BEFORE that, add a state-write step. Put it at the very end of the for-loop, after all phases succeed, before sending `Done`:

```rust
// Persist install state for future update detection.
{
    use crate::state::InstallState;
    use crate::installer::current_git_sha;

    let mut sidecars = Vec::new();
    if config.profile.includes_sidecars() {
        if config.sidecar.mineru_enabled { sidecars.push("mineru".to_string()); }
        if config.sidecar.rerank_enabled { sidecars.push("rerank".to_string()); }
    }

    let state = InstallState {
        profile: config.profile,
        mode: config.mode,
        install_dir: config.install_dir.clone(),
        data_dir: config.data_dir.clone(),
        git_sha: current_git_sha(&config.install_dir),
        installer_version: env!("CARGO_PKG_VERSION").to_string(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        sidecars,
    };
    let path = InstallState::default_path(crate::installer::is_root());
    if let Err(e) = state.save_to(&path) {
        tx.send(InstallMessage::Log(
            crate::app::LogLevel::Warning,
            format!("Failed to write install state: {e}"),
        )).await.ok();
    } else {
        tx.send(InstallMessage::Log(
            crate::app::LogLevel::Info,
            format!("Install state saved to {}", path.display()),
        )).await.ok();
    }
}
```

`chrono` is already in deps (used elsewhere in app.rs for log timestamps).

- [ ] **Step 3: Smoke build**

Run: `cd installer && cargo build --release`

Expected: clean.

- [ ] **Step 4: Commit**

```
feat(installer): persist InstallState after successful install

- written at end of run_installation (after Verification phase succeeds)
- captures git sha + installer version + sidecars + timestamp
- failure to write is logged as warning, doesn't block install
```

---

## Task 3: Detect existing state at startup

**Files:**
- Modify: `installer/src/main.rs` — read state on startup, store in `App`
- Modify: `installer/src/app.rs` — add `pub install_state: Option<InstallState>` field

- [ ] **Step 1: Add the field**

In `installer/src/app.rs`, add to the `App` struct (near the top of the field list):

```rust
    /// Pre-existing install detected on startup; None on fresh installs.
    pub install_state: Option<crate::state::InstallState>,
```

In `App::new`, initialize:

```rust
    install_state: crate::state::InstallState::load_from(
        &crate::state::InstallState::default_path(crate::installer::is_root()),
    ).unwrap_or(None),
```

- [ ] **Step 2: Use the detected state in main.rs**

In `installer/src/main.rs`, after `App::new(...)` returns the app, log whether existing install was found:

```rust
if let Some(state) = &app.install_state {
    eprintln!(
        "Detected existing install at {} (sha {}, profile {:?}, installed {})",
        state.install_dir, state.git_sha, state.profile, state.installed_at,
    );
}
```

(This is just diagnostic for now; Phase I wires the actual UI flow.)

- [ ] **Step 3: Smoke build + run**

```bash
cd installer && cargo build --release
sudo ./target/release/rantai-agents-installer --help 2>&1 | head -20
```

Expected: builds, runs (TUI may not show the eprintln properly in alt-screen mode — check stderr after exit if needed).

- [ ] **Step 4: Commit**

```
feat(installer): load InstallState on startup into App.install_state

Diagnostic eprintln only in this commit; UI routing comes next phase.
```

---

## Task 4: `update_mode` flag on App + Config

**Files:**
- Modify: `installer/src/app.rs` — add `pub update_mode: bool` on both `App` and `InstallConfig`

- [ ] **Step 1: Add fields**

In `installer/src/app.rs`:

In `InstallConfig`, near the `mode` field:

```rust
    /// True when the installer is re-running over an existing install (update path).
    /// Drives executor phase skipping and config-file preservation.
    pub update_mode: bool,
```

In `Default for InstallConfig`:

```rust
    update_mode: false,
```

In `App` struct:

```rust
    /// Mirrors `config.update_mode`. Set when the user picks "Update" on the
    /// Screen::UpdateOrFresh prompt.
    pub update_mode: bool,
```

In `App::new`:

```rust
    update_mode: false,
```

- [ ] **Step 2: Smoke build**

Run: `cd installer && cargo build --release`

Expected: clean.

- [ ] **Step 3: Commit**

```
feat(installer): add update_mode flag to App and InstallConfig

No behaviour change yet; Phase I wires it.
```

---

## Task 5: `Screen::UpdateOrFresh` variant + state

**Files:**
- Modify: `installer/src/app.rs` — add `Screen::UpdateOrFresh` variant + `update_or_fresh_index` field on App

- [ ] **Step 1: Add variant**

In `installer/src/app.rs`, add to the `Screen` enum (between `Welcome` and `ProfileSelect`):

```rust
pub enum Screen {
    Welcome,
    UpdateOrFresh,    // shown only when install_state is Some
    ProfileSelect,
    /* ... */
}
```

Add to `App`:

```rust
    pub update_or_fresh_index: usize,  // 0=Update, 1=Fresh, 2=Cancel
```

Initialize in `App::new`:

```rust
    update_or_fresh_index: 0,
```

- [ ] **Step 2: Smoke build**

Run: `cd installer && cargo build --release`

Expected: clean (only need to update any exhaustive matches over `Screen` — grep `match.*Screen` for any non-default arms).

- [ ] **Step 3: Commit**

```
feat(installer): Screen::UpdateOrFresh variant + index state
```

---

## Task 6: `update_or_fresh.rs` UI

**Files:**
- Create: `installer/src/ui/screens/update_or_fresh.rs`
- Modify: `installer/src/ui/screens/mod.rs` — register `pub mod update_or_fresh;`
- Modify: `installer/src/ui/mod.rs` — wire draw dispatch

- [ ] **Step 1: Create the screen**

Mirror `mode_select.rs` structure. Three options: Update, Fresh, Cancel.

```rust
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::App;
use crate::theme;
use crate::ui::widgets::status_bar;

const OPTIONS: [(&str, &str); 3] = [
    ("Update existing install", "Pull the latest code, re-run dependency install + DB migrations + sidecar refresh, restart services. Your .env is preserved."),
    ("Fresh install (overwrite)", "Wipe the existing install and start over. Your .env will be backed up to install.toml.bak."),
    ("Cancel", "Exit without changing anything."),
];

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();
    let outer = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(1)])
        .split(size);
    status_bar::draw(f, app, outer[1]);

    let main_block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border_active())
        .title(Span::styled(" Existing Install Detected ", theme::primary_bold()));
    let main_inner = main_block.inner(outer[0]);
    f.render_widget(main_block, outer[0]);

    let panels = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
        .split(main_inner);

    let items: Vec<ListItem> = OPTIONS
        .iter()
        .enumerate()
        .map(|(i, (label, _))| {
            let arrow = if i == app.update_or_fresh_index { theme::SYM_ARROW } else { " " };
            let style = if i == app.update_or_fresh_index { theme::primary_bold() } else { theme::text() };
            ListItem::new(Line::from(vec![
                Span::styled(format!(" {arrow} "), theme::primary()),
                Span::styled(*label, style),
            ]))
        })
        .collect();
    let list = List::new(items).block(
        Block::default().borders(Borders::RIGHT).border_style(theme::border_inactive()),
    );
    f.render_widget(list, panels[0]);

    let mut details: Vec<Line> = Vec::new();
    if let Some(s) = &app.install_state {
        details.push(Line::from(Span::styled("Existing install:", theme::muted())));
        details.push(Line::from(format!("  Path:      {}", s.install_dir)));
        details.push(Line::from(format!("  Profile:   {:?}", s.profile)));
        details.push(Line::from(format!("  Mode:      {:?}", s.mode)));
        details.push(Line::from(format!("  Git sha:   {}", s.git_sha)));
        details.push(Line::from(format!("  Installed: {}", s.installed_at)));
        details.push(Line::from(""));
    }
    let (_label, desc) = OPTIONS[app.update_or_fresh_index];
    details.push(Line::from(Span::styled(desc, theme::primary())));

    let para = Paragraph::new(details).wrap(Wrap { trim: true });
    f.render_widget(para, panels[1]);
}

pub fn selected_action(app: &App) -> UpdateAction {
    match app.update_or_fresh_index {
        0 => UpdateAction::Update,
        1 => UpdateAction::Fresh,
        _ => UpdateAction::Cancel,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateAction {
    Update,
    Fresh,
    Cancel,
}
```

If `theme::muted()` doesn't exist, use `theme::text()`.

- [ ] **Step 2: Register**

In `installer/src/ui/screens/mod.rs`:

```rust
pub mod update_or_fresh;
```

In `installer/src/ui/mod.rs`'s draw dispatch:

```rust
Screen::UpdateOrFresh => screens::update_or_fresh::draw(f, app),
```

- [ ] **Step 3: Smoke build**

Run: `cd installer && cargo build --release`

Expected: clean.

- [ ] **Step 4: Commit**

```
feat(installer): UpdateOrFresh screen UI

Three options: Update / Fresh / Cancel. Right pane shows the detected
install metadata + a description of the highlighted option.
```

---

## Task 7: Wire UpdateOrFresh into the state machine

**Files:**
- Modify: `installer/src/main.rs`

- [ ] **Step 1: Route Welcome → UpdateOrFresh when state exists**

Find the `Screen::Welcome` Enter handler. Change it:

```rust
Screen::Welcome => {
    if let KeyCode::Enter = key.code {
        app.screen = if app.install_state.is_some() {
            Screen::UpdateOrFresh
        } else {
            Screen::ProfileSelect
        };
    }
}
```

- [ ] **Step 2: Add UpdateOrFresh key handler**

```rust
Screen::UpdateOrFresh => match key.code {
    KeyCode::Up => {
        if app.update_or_fresh_index > 0 { app.update_or_fresh_index -= 1; }
    }
    KeyCode::Down => {
        if app.update_or_fresh_index < 2 { app.update_or_fresh_index += 1; }
    }
    KeyCode::Enter => {
        use ui::screens::update_or_fresh::{selected_action, UpdateAction};
        match selected_action(app) {
            UpdateAction::Update => {
                // Adopt the existing install's profile/mode/dirs into config
                if let Some(s) = &app.install_state {
                    app.config.profile = s.profile;
                    app.config.mode = s.mode;
                    app.mode = s.mode;
                    app.config.install_dir = s.install_dir.clone();
                    app.config.data_dir = s.data_dir.clone();
                    app.config.update_mode = true;
                    app.update_mode = true;
                }
                // Skip ProfileSelect / ModeSelect / OptionalServices / Config —
                // update inherits everything from the saved state.
                app.screen = Screen::Preflight;
            }
            UpdateAction::Fresh => {
                app.config.update_mode = false;
                app.update_mode = false;
                app.screen = Screen::ProfileSelect;
            }
            UpdateAction::Cancel => {
                app.should_quit = true;
            }
        }
    }
    KeyCode::Esc => {
        app.screen = Screen::Welcome;
    }
    _ => {}
},
```

- [ ] **Step 3: Smoke**

Run: `cd installer && cargo build --release`

Expected: clean. To manually smoke: temporarily write a fake state file (`echo 'profile = "AllInOne"\nmode = "Full"\ninstall_dir = "/tmp"\ndata_dir = "/tmp"\ngit_sha = "abc"\ninstaller_version = "0.1.0"\ninstalled_at = "2026-04-25T00:00:00Z"\nsidecars = []' > ~/.config/rantai-agents/install.toml`) then `cargo run` — Welcome should advance to UpdateOrFresh.

- [ ] **Step 4: Commit**

```
feat(installer): route to UpdateOrFresh when InstallState exists

- Welcome→UpdateOrFresh when install.toml present, else Welcome→ProfileSelect
- Update branch adopts profile/mode/dirs from saved state and skips straight to Preflight
- Fresh branch falls through to normal ProfileSelect flow
- Cancel exits cleanly
```

---

## Task 8: `installer/src/installer/update.rs` — git auto-stash + pull + restore

**Files:**
- Create: `installer/src/installer/update.rs`
- Modify: `installer/src/installer/mod.rs` — `pub mod update;`

- [ ] **Step 1: Implement the helper**

```rust
//! Git update helper: stash any uncommitted changes, fast-forward the working
//! tree, restore the stash. Used by Phase::Update and the `rantai-agents update`
//! CLI subcommand.

use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::run_command;

pub struct UpdateResult {
    /// Old short SHA before pull.
    pub old_sha: String,
    /// New short SHA after pull.
    pub new_sha: String,
    /// True if a stash was created (and successfully restored).
    pub stash_used: bool,
}

pub async fn git_update(
    install_dir: &str,
    branch: &str,
    tx: &Sender<InstallMessage>,
) -> Result<UpdateResult, String> {
    let old_sha = sha_at(install_dir);

    // Detect uncommitted changes.
    let dirty = !run_command(
        "git",
        &["-C", install_dir, "status", "--porcelain"],
    )?
    .trim()
    .is_empty();

    let stash_name = format!(
        "rantai-agents-installer-autostash-{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    );
    let mut stash_used = false;
    if dirty {
        tx.send(InstallMessage::Progress(
            "Local changes detected — stashing...".into(),
        )).await.ok();
        run_command(
            "git",
            &["-C", install_dir, "stash", "push", "--include-untracked",
              "-m", &stash_name],
        )?;
        stash_used = true;
    }

    tx.send(InstallMessage::Progress(format!(
        "Fetching {branch}..."
    ))).await.ok();
    run_command("git", &["-C", install_dir, "fetch", "origin", branch])?;
    run_command("git", &["-C", install_dir, "checkout", branch])?;
    run_command("git", &["-C", install_dir, "pull", "--ff-only", "origin", branch])?;

    if stash_used {
        tx.send(InstallMessage::Progress(
            "Restoring stashed local changes...".into(),
        )).await.ok();
        // pop returns non-zero if there's a conflict; we tolerate that and leave
        // the stash in place for the operator to resolve.
        if run_command("git", &["-C", install_dir, "stash", "pop"]).is_err() {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!(
                    "Stash {stash_name} could not be auto-popped (likely conflicts). \
                     Resolve manually: `git -C {install_dir} stash list`",
                ),
            )).await.ok();
        }
    }

    Ok(UpdateResult {
        old_sha,
        new_sha: sha_at(install_dir),
        stash_used,
    })
}

fn sha_at(install_dir: &str) -> String {
    super::current_git_sha(install_dir)
}
```

- [ ] **Step 2: Register the module**

In `installer/src/installer/mod.rs`:

```rust
pub mod update;
```

- [ ] **Step 3: Smoke build**

Run: `cd installer && cargo build --release`

Expected: clean.

- [ ] **Step 4: Commit**

```
feat(installer): update::git_update — stash, ff-only pull, restore stash

Mirrors the hermes-agent install.sh update path: detects dirty tree, stashes
with an installer-tagged name, pulls fast-forward, pops the stash. Reports
old/new SHAs in UpdateResult.
```

---

## Task 9: Executor branches into update phase set

**Files:**
- Modify: `installer/src/installer/executor.rs`
- Modify: `installer/src/installer/profile.rs` — `profile_skips_phase` is unchanged but executor's `should_skip_phase` gains an update-mode branch
- Modify: `installer/src/installer/config.rs` — `generate_config` skips writing `.env` when `config.update_mode` is true (preserves the existing one)

- [ ] **Step 1: Update-mode phase mask**

In `installer/src/installer/executor.rs`:

The update-mode phase set is: `Preflight, Update, Dependencies, Configuration, Database, SidecarInstall, Verification`. Note `Update` is a NEW phase variant. Add it.

In `installer/src/app.rs::Phase`, add a new variant between `Preflight` and `Dependencies`:

```rust
pub enum Phase {
    Preflight,
    Update,           // new — only runs when config.update_mode
    Dependencies,
    Infrastructure,
    /* ... rest unchanged ... */
}
```

Update `Phase::label`, `Phase::index`, `Phase::ALL`, and `Phase::COUNT`:

```rust
    pub fn label(&self) -> &str {
        match self {
            Self::Preflight => "Preflight Checks",
            Self::Update => "Pull Latest Code",
            Self::Dependencies => "Install Dependencies",
            /* ... */
        }
    }
    pub fn index(&self) -> usize {
        match self {
            Self::Preflight => 0,
            Self::Update => 1,
            Self::Dependencies => 2,
            Self::Infrastructure => 3,
            Self::ApplicationSetup => 4,
            Self::Configuration => 5,
            Self::Database => 6,
            Self::Services => 7,
            Self::SidecarInstall => 8,
            Self::Verification => 9,
        }
    }
    pub const ALL: &'static [Phase] = &[
        Phase::Preflight,
        Phase::Update,
        Phase::Dependencies,
        Phase::Infrastructure,
        Phase::ApplicationSetup,
        Phase::Configuration,
        Phase::Database,
        Phase::Services,
        Phase::SidecarInstall,
        Phase::Verification,
    ];
    pub const COUNT: usize = 10;
```

In `installer/src/installer/profile.rs::profile_skips_phase`, leave it alone — `Update` is orthogonal to profile (every profile skips it on fresh install, every profile runs it on update). The executor's `should_skip_phase` handles that.

In `installer/src/installer/executor.rs::should_skip_phase`:

```rust
fn should_skip_phase(phase: Phase, config: &InstallConfig) -> bool {
    // Profile-based skip takes precedence
    if crate::installer::profile::profile_skips_phase(config.profile, phase) {
        return true;
    }
    // Update phase only runs in update mode
    if phase == Phase::Update && !config.update_mode {
        return true;
    }
    // In update mode, skip phases that only matter on fresh install
    if config.update_mode {
        if matches!(phase, Phase::Infrastructure | Phase::ApplicationSetup | Phase::Services) {
            return true;
        }
    }
    // existing mode-based skip logic stays below
    /* ... */
}
```

The reasoning: update mode trusts that infrastructure (Postgres/SurrealDB containers) is already up, the app dir is already cloned (Update phase pulls into it), and the systemd service unit is already installed (Services phase only writes the unit; we'll just `systemctl restart` from inside Verification).

- [ ] **Step 2: Wire `Phase::Update` execution**

In `executor.rs::execute_phase`, add the new arm:

```rust
Phase::Update => {
    use super::update;
    let branch = std::env::var("RANTAI_AGENTS_BRANCH").unwrap_or_else(|_| "main".to_string());
    let result = update::git_update(&config.install_dir, &branch, tx).await?;
    tx.send(InstallMessage::Log(
        crate::app::LogLevel::Info,
        format!(
            "Pulled {} → {} ({}{})",
            result.old_sha,
            result.new_sha,
            if result.old_sha == result.new_sha { "no changes" } else { "updated" },
            if result.stash_used { "; stash auto-restored" } else { "" },
        ),
    )).await.ok();
    Ok(())
}
```

- [ ] **Step 3: Preserve `.env` in update mode**

In `installer/src/installer/config.rs::generate_config`, add an early-return when in update mode AND `.env` already exists:

```rust
pub fn generate_config(config: &mut InstallConfig) -> Result<(), String> {
    let env_path = format!("{}/.env", config.install_dir);

    if config.update_mode && std::path::Path::new(&env_path).exists() {
        // Update mode: don't clobber the operator's tuned .env.
        // (Future: a key-diff merge could be added here.)
        return Ok(());
    }

    // existing secret auto-fill + render_env + write logic stays below
    /* ... */
}
```

- [ ] **Step 4: Restart services in Verification when update mode**

In `installer/src/installer/verify.rs`, near the top of `run_verification`, when in update mode, restart the relevant services before the health checks:

```rust
if config.update_mode {
    // Best-effort restart so the verify checks hit the new code.
    if config.profile.includes_app() {
        let _ = super::run_sudo("systemctl", &["restart", "rantai-agents"]);
    }
    if config.profile.includes_sidecars() {
        if config.sidecar.mineru_enabled {
            let _ = super::run_sudo("systemctl", &["restart", "rantai-agents-mineru"]);
        }
        if config.sidecar.rerank_enabled {
            let _ = super::run_sudo("systemctl", &["restart", "rantai-agents-rerank"]);
        }
    }
    // Give services a few seconds to come up before /health checks.
    std::thread::sleep(std::time::Duration::from_secs(5));
}
```

- [ ] **Step 5: Compile + commit**

Run `cd installer && cargo build --release` and `cargo test`.

Commit:

```
feat(installer): update mode — Phase::Update + skip mask + .env preservation

- new Phase::Update slot at index 1, runs git_update only when config.update_mode
- update mode skips Infrastructure / ApplicationSetup / Services (already done)
- generate_config short-circuits when update_mode + .env exists (don't clobber)
- verify.rs restarts systemd units before /health checks in update mode
- RANTAI_AGENTS_BRANCH env var pins the update branch (default "main")
```

Note: `Phase::COUNT` change from 9 → 10 may break UI widget rows; grep for `vec![Status::Pending; ` and `Phase::COUNT` to confirm. Should be fine since Phase A used `Phase::COUNT` everywhere.

---

## Task 10: `[[bin]]` for `rantai-agents` CLI

**Files:**
- Modify: `installer/Cargo.toml`
- Create: `installer/src/bin/rantai-agents.rs`

- [ ] **Step 1: Cargo.toml**

In the existing `installer/Cargo.toml`, ADD a second `[[bin]]` entry below the first one:

```toml
[[bin]]
name = "rantai-agents-installer"
path = "src/main.rs"

[[bin]]
name = "rantai-agents"
path = "src/bin/rantai-agents.rs"
```

- [ ] **Step 2: Stub the binary**

Create `installer/src/bin/rantai-agents.rs`:

```rust
fn main() -> std::process::ExitCode {
    rantai_agents_installer::cli::main()
}
```

(The actual logic lives in `cli::main` so it can be unit-tested.)

- [ ] **Step 3: Compile**

Run: `cd installer && cargo build --release`

Expected: fails — no `cli::main` yet. That's fine; commit and proceed to Task 11.

Actually skip the commit until Task 11 puts the stub `cli::main` in place (so the build is green at every commit boundary).

---

## Task 11: `cli::main` with clap subcommand parsing

**Files:**
- Create: `installer/src/cli/mod.rs`
- Modify: `installer/src/lib.rs` — `pub mod cli;`
- Create: `installer/tests/cli_parse.rs`

- [ ] **Step 1: Write the failing test**

Create `installer/tests/cli_parse.rs`:

```rust
use rantai_agents_installer::cli::Cli;
use clap::Parser;

#[test]
fn parses_update() {
    let cli = Cli::try_parse_from(["rantai-agents", "update"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Update { .. }));
}

#[test]
fn parses_doctor() {
    let cli = Cli::try_parse_from(["rantai-agents", "doctor"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Doctor));
}

#[test]
fn parses_status() {
    let cli = Cli::try_parse_from(["rantai-agents", "status"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Status));
}

#[test]
fn parses_version() {
    let cli = Cli::try_parse_from(["rantai-agents", "version"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Version));
}

#[test]
fn update_takes_branch_flag() {
    let cli = Cli::try_parse_from(["rantai-agents", "update", "--branch", "main"]).unwrap();
    if let rantai_agents_installer::cli::Command::Update { branch } = cli.command {
        assert_eq!(branch.as_deref(), Some("main"));
    } else {
        panic!("expected Update");
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd installer && cargo test --test cli_parse`

Expected: doesn't compile — no `cli` module.

- [ ] **Step 3: Implement `cli/mod.rs`**

```rust
//! `rantai-agents` CLI surface. See `installer/src/bin/rantai-agents.rs` for
//! the binary entry; this module holds the clap definitions + dispatch logic
//! so the CLI can be tested in isolation.

use clap::{Parser, Subcommand};
use std::process::ExitCode;

#[derive(Debug, Parser)]
#[command(name = "rantai-agents", version, about = "RantAI Agents control CLI")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Update RantAI Agents to the latest version.
    Update {
        /// Git branch to update to. Defaults to "main" or RANTAI_AGENTS_BRANCH.
        #[arg(long)]
        branch: Option<String>,
    },
    /// Run health checks against the installed system.
    Doctor,
    /// Print install status (profile, version, services).
    Status,
    /// Print installer version + git sha of installed code.
    Version,
}

pub fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Update { branch } => crate::cli::update::run(branch.as_deref()),
        Command::Doctor => crate::cli::doctor::run(),
        Command::Status => crate::cli::status::run(),
        Command::Version => crate::cli::version::run(),
    }
}

pub mod doctor;
pub mod status;
pub mod update;
pub mod version;
```

For the four subcommand modules, create stubs that return `ExitCode::SUCCESS` so the build is green; we'll fill them in Tasks 12–15.

```rust
// installer/src/cli/update.rs
use std::process::ExitCode;
pub fn run(_branch: Option<&str>) -> ExitCode {
    eprintln!("rantai-agents update: not yet implemented");
    ExitCode::FAILURE
}
```

Same shape for `doctor.rs`, `status.rs`, `version.rs`.

In `installer/src/lib.rs`:

```rust
pub mod cli;
```

- [ ] **Step 4: Verify tests + binary build**

Run:

```bash
cd installer
cargo test --test cli_parse 2>&1 | tail
cargo build --release 2>&1 | tail
ls target/release/rantai-agents
```

Expected: 5 tests pass; both binaries (`rantai-agents-installer` and `rantai-agents`) built; the second exits 1 with "not yet implemented" when run.

- [ ] **Step 5: Commit**

```
feat(installer): rantai-agents CLI binary + subcommand parser

- second [[bin]] in Cargo.toml: rantai-agents (small Rust CLI)
- clap subcommands: update / doctor / status / version
- update accepts --branch <name>
- 5 parse tests; subcommand stubs return Failure pending Tasks 12–15
```

---

## Task 12: `rantai-agents version` subcommand

**Files:**
- Modify: `installer/src/cli/version.rs`

- [ ] **Step 1: Implement**

```rust
use std::process::ExitCode;

pub fn run() -> ExitCode {
    let installer_version = env!("CARGO_PKG_VERSION");
    println!("rantai-agents-installer {installer_version}");

    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => {
            println!("installed     {} (sha {})", s.installer_version, s.git_sha);
            println!("install dir   {}", s.install_dir);
            println!("profile       {:?}", s.profile);
            println!("installed at  {}", s.installed_at);
        }
        Ok(None) => println!("(no install state at {})", path.display()),
        Err(e) => {
            eprintln!("failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}
```

- [ ] **Step 2: Smoke**

```bash
cd installer && cargo build --release
./target/release/rantai-agents version
```

Expected: prints installer version + either install state or `(no install state ...)`.

- [ ] **Step 3: Commit**

```
feat(installer): rantai-agents version subcommand

Prints installer crate version + (if present) the recorded install_state:
installed version, git sha, install dir, profile, install timestamp.
```

---

## Task 13: `rantai-agents status` subcommand

**Files:**
- Modify: `installer/src/cli/status.rs`

- [ ] **Step 1: Implement**

```rust
use std::process::ExitCode;

pub fn run() -> ExitCode {
    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    let state = match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => s,
        Ok(None) => {
            eprintln!("No install state found at {}.", path.display());
            eprintln!("Run the installer first: ./rantai-agents-installer");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("Failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    };

    println!("Profile:     {:?}", state.profile);
    println!("Mode:        {:?}", state.mode);
    println!("Install dir: {}", state.install_dir);
    println!("Git sha:     {}", state.git_sha);
    println!();
    println!("Services:");

    let mut services = vec![];
    if state.profile.includes_app() {
        services.push("rantai-agents".to_string());
    }
    for sc in &state.sidecars {
        services.push(format!("rantai-agents-{sc}"));
    }
    for svc in services {
        let active = match crate::installer::run_command(
            "systemctl",
            &["is-active", &svc],
        ) {
            Ok(s) => s.trim().to_string(),
            Err(_) => "unknown".to_string(),
        };
        println!("  {svc:<32} {active}");
    }
    ExitCode::SUCCESS
}
```

- [ ] **Step 2: Smoke**

```bash
cd installer && cargo build --release
./target/release/rantai-agents status
```

Expected: prints "No install state found" if running on a clean machine. With a state file present, prints the table.

- [ ] **Step 3: Commit**

```
feat(installer): rantai-agents status subcommand

Reads InstallState and prints profile/mode/dir/sha + a row per managed
systemd service with `systemctl is-active` output.
```

---

## Task 14: `rantai-agents update` subcommand

**Files:**
- Modify: `installer/src/cli/update.rs`

- [ ] **Step 1: Implement**

The `update` CLI re-runs the existing executor with `update_mode = true`. To do that headless (no TUI), we drain the `InstallMessage` channel into stdout instead of routing into ratatui.

```rust
use std::process::ExitCode;
use tokio::sync::mpsc;

pub fn run(branch: Option<&str>) -> ExitCode {
    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    let state = match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => s,
        Ok(None) => {
            eprintln!("No install detected at {}. Run the installer first.", path.display());
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("Failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    };

    if let Some(b) = branch {
        // Honour the --branch flag via env so executor::Phase::Update sees it.
        std::env::set_var("RANTAI_AGENTS_BRANCH", b);
    }

    // Build an InstallConfig from state for update_mode = true.
    let mut config = crate::app::InstallConfig::default();
    config.profile = state.profile;
    config.mode = state.mode;
    config.install_dir = state.install_dir.clone();
    config.data_dir = state.data_dir.clone();
    config.update_mode = true;

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("tokio init: {e}");
            return ExitCode::FAILURE;
        }
    };

    rt.block_on(async {
        let (tx, mut rx) = mpsc::channel::<crate::installer::executor::InstallMessage>(64);
        let install = tokio::spawn(async move {
            crate::installer::executor::run_installation(config, tx).await;
        });

        let mut had_error = false;
        while let Some(msg) = rx.recv().await {
            use crate::installer::executor::InstallMessage::*;
            match msg {
                PhaseStart(p) => println!("  ▶ {}", p.label()),
                PhaseComplete(p) => println!("  ✓ {}", p.label()),
                PhaseSkipped(p) => println!("  – {} (skipped)", p.label()),
                Progress(s) => println!("    {s}"),
                Log(_, s) => println!("    {s}"),
                Error(p, e) => {
                    eprintln!("  ✗ {}: {e}", p.label());
                    had_error = true;
                }
                Done(Ok(())) => println!("Update complete."),
                Done(Err(e)) => {
                    eprintln!("Update failed: {e}");
                    had_error = true;
                }
            }
        }

        let _ = install.await;
        if had_error { ExitCode::FAILURE } else { ExitCode::SUCCESS }
    })
}
```

- [ ] **Step 2: Smoke**

```bash
cd installer && cargo build --release
sudo ./target/release/rantai-agents update --branch main 2>&1 | head -40
```

Expected (assuming a real install exists): pulls, runs Dependencies + Configuration (no-op for `.env`) + Database migrations + SidecarInstall (pip install, model is already cached so fast) + Verification with restarts. Prints "Update complete."

For a fresh machine without a state file: prints "No install detected." and exits 1.

- [ ] **Step 3: Commit**

```
feat(installer): rantai-agents update subcommand

Re-runs the executor with update_mode=true, draining InstallMessage events
to stdout. Honours --branch flag via RANTAI_AGENTS_BRANCH env var.
Reads InstallState to inherit profile/mode/dirs.
```

---

## Task 15: `rantai-agents doctor` subcommand

**Files:**
- Modify: `installer/src/cli/doctor.rs`

- [ ] **Step 1: Implement**

Doctor runs the same checks as the Verify phase but standalone, no TUI. Reuse `verify::run_verification` if it can be called with just a config + collect into a Vec.

```rust
use std::process::ExitCode;
use tokio::sync::mpsc;

pub fn run() -> ExitCode {
    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    let state = match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => s,
        Ok(None) => {
            eprintln!("No install detected at {}. Run the installer first.", path.display());
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("Failed to read {}: {e}", path.display());
            return ExitCode::FAILURE;
        }
    };

    let mut config = crate::app::InstallConfig::default();
    config.profile = state.profile;
    config.mode = state.mode;
    config.install_dir = state.install_dir.clone();
    config.data_dir = state.data_dir.clone();

    // Reuse the executor in update_mode but only run Verification.
    config.update_mode = true; // skip restart hassle? actually doctor shouldn't restart

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("tokio init: {e}");
            return ExitCode::FAILURE;
        }
    };

    rt.block_on(async {
        // Doctor calls verify directly without restarting services. To avoid
        // the verify.rs auto-restart, set update_mode=false here. (Doctor is
        // diagnostic only.)
        let mut cfg = config.clone();
        cfg.update_mode = false;

        let (tx, mut rx) = mpsc::channel::<crate::installer::executor::InstallMessage>(32);
        let task = tokio::spawn(async move {
            crate::installer::verify::run_verification(&cfg, &tx).await
        });

        while let Some(msg) = rx.recv().await {
            use crate::installer::executor::InstallMessage::*;
            match msg {
                Log(_, s) | Progress(s) => println!("  {s}"),
                _ => {}
            }
        }

        match task.await {
            Ok(Ok(checks)) => {
                println!("\nResults:");
                let mut ok = 0;
                let mut bad = 0;
                for c in &checks {
                    let mark = match c.status {
                        crate::app::Status::Success => { ok += 1; "✓" }
                        crate::app::Status::Warning => "!",
                        crate::app::Status::Error => { bad += 1; "✗" }
                        _ => "?",
                    };
                    println!("  {mark} {} — {}", c.name, c.message.as_deref().unwrap_or(""));
                }
                println!("\n{ok} pass, {bad} fail");
                if bad > 0 { ExitCode::FAILURE } else { ExitCode::SUCCESS }
            }
            Ok(Err(e)) => { eprintln!("doctor failed: {e}"); ExitCode::FAILURE }
            Err(e) => { eprintln!("task join: {e}"); ExitCode::FAILURE }
        }
    })
}
```

This requires `verify::run_verification` to return `Result<Vec<CheckItem>, String>`. Check the current signature; if it pushes into a Vec internally and returns `Result<(), String>`, refactor it slightly to return the Vec OR add a `pub fn collect_verification_checks(config) -> Result<Vec<CheckItem>, String>` helper.

If refactoring is too invasive, doctor can shell out to `systemctl is-active` for each known service + `curl /health` for each sidecar, mirroring verify.rs but standalone. That's actually simpler:

```rust
pub fn run() -> ExitCode {
    let path = crate::state::InstallState::default_path(crate::installer::is_root());
    let state = match crate::state::InstallState::load_from(&path) {
        Ok(Some(s)) => s,
        Ok(None) => { eprintln!("No install detected."); return ExitCode::FAILURE; }
        Err(e) => { eprintln!("{e}"); return ExitCode::FAILURE; }
    };

    let mut ok_count = 0;
    let mut bad_count = 0;
    let mut check = |name: &str, ok: bool, msg: String| {
        let mark = if ok { ok_count += 1; "✓" } else { bad_count += 1; "✗" };
        println!("  {mark} {name:<40} {msg}");
    };

    if state.profile.includes_app() {
        let env = format!("{}/.env", state.install_dir);
        check(".env file present", std::path::Path::new(&env).exists(),
            format!("at {env}"));

        let active = crate::installer::run_command("systemctl", &["is-active", "rantai-agents"])
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        check("rantai-agents service", active == "active", active);
    }
    for sc in &state.sidecars {
        let svc = format!("rantai-agents-{sc}");
        let active = crate::installer::run_command("systemctl", &["is-active", &svc])
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        check(&format!("{svc} service"), active == "active", active);

        let port = match sc.as_str() { "mineru" => 8100, "rerank" => 8200, _ => 0 };
        if port > 0 {
            let url = format!("http://localhost:{port}/health");
            let result = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .ok()
                .and_then(|c| c.get(&url).send().ok());
            let (ok, msg) = match result {
                Some(r) if r.status().is_success() => (true, format!("200 OK at {url}")),
                Some(r) => (false, format!("{} at {url}", r.status())),
                None => (false, format!("no response from {url}")),
            };
            check(&format!("{svc} /health"), ok, msg);
        }
    }

    println!("\n{ok_count} pass, {bad_count} fail");
    if bad_count > 0 { ExitCode::FAILURE } else { ExitCode::SUCCESS }
}
```

Use this simpler variant — no executor coupling.

- [ ] **Step 2: Smoke**

```bash
cd installer && cargo build --release
./target/release/rantai-agents doctor
```

Expected (no install): "No install detected." With install: row per service + /health, summary count.

- [ ] **Step 3: Commit**

```
feat(installer): rantai-agents doctor subcommand

Standalone health check: .env presence + systemctl is-active + /health for
every service named in InstallState.sidecars. Returns exit 0 on all-pass,
1 on any failure.
```

---

## Task 16: Install `rantai-agents` CLI to /usr/local/bin during Services phase

**Files:**
- Modify: `installer/src/installer/services.rs`

- [ ] **Step 1: Add the CLI install step**

In `services.rs::install_services` (or whatever runs in `Phase::Services`), after the systemd unit is installed, add:

```rust
// Install the rantai-agents CLI on PATH for operators.
{
    let installer_binary = std::env::current_exe()
        .map_err(|e| format!("cannot resolve current_exe: {e}"))?;
    // Sibling binary name (cargo builds both into the same dir).
    let cli = installer_binary
        .parent()
        .ok_or_else(|| "current_exe has no parent".to_string())?
        .join("rantai-agents");

    if cli.exists() {
        tx.send(InstallMessage::Progress(
            "Installing rantai-agents CLI to /usr/local/bin...".into(),
        )).await.ok();
        run_sudo("cp", &[&cli.to_string_lossy(), "/usr/local/bin/rantai-agents"])?;
        run_sudo("chmod", &["755", "/usr/local/bin/rantai-agents"])?;
    } else {
        tx.send(InstallMessage::Log(
            crate::app::LogLevel::Warning,
            format!("rantai-agents CLI binary not found next to installer at {cli:?}"),
        )).await.ok();
    }
}
```

- [ ] **Step 2: Compile + commit**

```
feat(installer): install rantai-agents CLI to /usr/local/bin

Sibling binary built from the same crate; copied during Phase::Services so
operators get `rantai-agents update` / `doctor` / `status` on PATH.
```

---

## Task 17: `scripts/install.sh` curl bootstrap

**Files:** `scripts/install.sh` (new), executable

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# RantAI Agents bootstrap installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/RantAI-dev/RantAI-Agents/main/scripts/install.sh | bash
#
# Or with a pinned branch:
#   curl -fsSL https://.../install.sh | bash -s -- --branch main
#
# What this does:
#   1. Installs prerequisites (curl, git, build-essential, rustup if missing).
#   2. Clones the repo to /opt/rantai-agents (or pulls if already present).
#   3. Builds the installer (cargo build --release in installer/).
#   4. Runs the installer. If install.toml exists, the installer enters update mode
#      and walks the operator through the UpdateOrFresh screen.
#
# Re-run this script any time to update — same path as `rantai-agents update`.

set -euo pipefail

INSTALL_DIR="${RANTAI_AGENTS_DIR:-/opt/rantai-agents}"
BRANCH="${RANTAI_AGENTS_BRANCH:-main}"
REPO="${RANTAI_AGENTS_REPO:-https://github.com/RantAI-dev/RantAI-Agents.git}"

while [ $# -gt 0 ]; do
    case "$1" in
        --branch) BRANCH="$2"; shift 2 ;;
        --dir)    INSTALL_DIR="$2"; shift 2 ;;
        --repo)   REPO="$2"; shift 2 ;;
        --help)   sed -n '2,20p' "$0"; exit 0 ;;
        *)        echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

log() { printf "\033[1;36m[install]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || return 1
}

ensure_root_or_sudo() {
    if [ "$(id -u)" -ne 0 ]; then
        if ! require_cmd sudo; then
            err "Not running as root and sudo is not installed. Re-run as root."
        fi
        SUDO="sudo"
    else
        SUDO=""
    fi
}

apt_install() {
    log "Installing prerequisites: $*"
    $SUDO apt-get update -qq
    $SUDO apt-get install -y "$@"
}

ensure_root_or_sudo

# 1. prerequisites
missing=()
require_cmd git || missing+=(git)
require_cmd curl || missing+=(curl)
require_cmd cc || missing+=(build-essential)
if [ ${#missing[@]} -gt 0 ]; then apt_install "${missing[@]}"; fi

if ! require_cmd cargo; then
    log "Installing rustup (cargo not found)..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
fi

# 2. clone or pull
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Existing repo at $INSTALL_DIR — fetching $BRANCH..."
    $SUDO git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    $SUDO git -C "$INSTALL_DIR" checkout "$BRANCH"
    $SUDO git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
    log "Cloning $REPO into $INSTALL_DIR (branch: $BRANCH)..."
    $SUDO mkdir -p "$INSTALL_DIR"
    $SUDO chown "$(id -u):$(id -g)" "$INSTALL_DIR"
    git clone --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
fi

# 3. build installer
log "Building installer..."
( cd "$INSTALL_DIR/installer" && cargo build --release )

# 4. run installer (TUI). If install.toml exists, the installer routes to
# UpdateOrFresh. Otherwise it routes to ProfileSelect.
log "Launching installer TUI..."
$SUDO "$INSTALL_DIR/installer/target/release/rantai-agents-installer"
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/install.sh
git add scripts/install.sh
git commit-sulthan -m "feat(scripts): install.sh — curl bootstrap (fresh + update)

Mirrors hermes-agent install.sh: detects existing /opt/rantai-agents,
git-pulls fast-forward, builds the installer, launches the TUI. The TUI
itself decides update vs fresh based on install.toml presence.
Honours --branch / --dir / --repo flags; defaults to main / /opt/rantai-agents
/ the canonical RantAI-dev repo."
```

---

## Task 18: `docs/INSTALL.md`

**Files:** `docs/INSTALL.md` (new)

- [ ] **Step 1: Write it**

```markdown
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
```

- [ ] **Step 2: Commit**

```
docs: add INSTALL.md — install + update + doctor + pinning
```

---

## Task 19: README links + final test pass

**Files:**
- Modify: `README.md` (top-level) — add a quickstart pointer to docs/INSTALL.md
- Run regression

- [ ] **Step 1: Top-of-README quickstart**

Find the top-level `README.md`. Right under the project tagline (or wherever the install instructions currently live), add:

```markdown
## Install

    curl -fsSL https://raw.githubusercontent.com/RantAI-dev/RantAI-Agents/main/scripts/install.sh | bash

Update with `sudo rantai-agents update`. See [docs/INSTALL.md](docs/INSTALL.md)
for profiles, doctor, and version pinning.
```

(Adapt to whatever style the existing README uses.)

- [ ] **Step 2: Full regression**

```bash
cd installer
cargo test 2>&1 | tail
cargo build --release 2>&1 | tail
cargo clippy --release -- -D warnings 2>&1 | tail
cargo fmt --check
```

Expected: all green. Test count should now be ~30+ (Phase H added 4, Phase I added 0, Phase J added 5, plus existing 27).

If clippy complains about anything new, fix in this commit.

- [ ] **Step 3: Commit**

```
docs(readme): one-line install + update pointer to docs/INSTALL.md
```

---

## Self-Review

Ran the three checks against this plan.

**1. Spec coverage.** Hermes-agent's update story has six features:

| Hermes feature | Plan task |
|----------------|-----------|
| One-line curl install | Task 17 (`scripts/install.sh`) |
| Re-run install for update | Task 17 (`.git` detection) + Task 7 (UpdateOrFresh screen) |
| `update` CLI command | Task 14 (`rantai-agents update`) |
| `doctor` CLI command | Task 15 (`rantai-agents doctor`) |
| Auto-stash + restore local changes | Task 8 (`update::git_update`) |
| Branch pinning | Task 14 (`--branch` flag) + Task 17 (`--branch` flag) + `RANTAI_AGENTS_BRANCH` env |

Plus we add: state persistence (Tasks 1–4) and `version`/`status` subcommands (Tasks 12–13). All hermes features mapped.

**2. Placeholder scan.** Searched for "TBD", "appropriate", "similar to", "as needed". Two soft spots:
- Task 6 says "If `theme::muted()` doesn't exist, use `theme::text()`" — explicit fallback, fine.
- Task 15 mentions an alternative if `verify::run_verification` doesn't return a Vec — chose the simpler standalone path inline. Fine.

No blocking placeholders.

**3. Type consistency.** Cross-checked: `InstallState` fields (`profile, mode, install_dir, data_dir, git_sha, installer_version, installed_at, sidecars`) used identically across Tasks 1, 2, 5, 12, 13, 14, 15. `UpdateAction::{Update, Fresh, Cancel}` used in Task 6 (defined) and Task 7 (consumed). `Phase::Update` added in Task 9, used in same task only. `Cli::Command::{Update, Doctor, Status, Version}` defined in Task 11, each subcommand handler in Tasks 12–15. `update_mode: bool` added in Task 4, consumed in Tasks 7, 9, 14. All consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-25-installer-update-mode.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
