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
