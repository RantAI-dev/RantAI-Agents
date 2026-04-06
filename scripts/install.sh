#!/usr/bin/env bash
# RantAI Agents Installer Bootstrap Script
# Usage: curl -fsSL https://github.com/RantAI-dev/RantAI-Agents/releases/latest/download/install.sh | bash
set -euo pipefail

REPO="RantAI-dev/RantAI-Agents"
BINARY_NAME="rantai-agents-installer"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check prerequisites
check_prerequisites() {
    if ! command -v curl &>/dev/null; then
        err "curl is required. Install it with: sudo apt-get install curl"
        exit 1
    fi

    if [ "$(id -u)" -ne 0 ]; then
        if ! command -v sudo &>/dev/null; then
            err "This script must be run as root or with sudo available"
            exit 1
        fi
    fi
}

# Detect architecture
detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64) echo "x86_64" ;;
        aarch64|arm64) echo "aarch64" ;;
        *)
            err "Unsupported architecture: $arch"
            exit 1
            ;;
    esac
}

# Download and run installer
download_installer() {
    local arch="$1"
    shift
    local variant="linux-musl"
    local binary="${BINARY_NAME}-${arch}-${variant}"
    local url="https://github.com/${REPO}/releases/latest/download/${binary}"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    info "Downloading ${BINARY_NAME} for ${arch}..."
    if curl -fsSL -o "${tmp_dir}/${BINARY_NAME}" "$url"; then
        if [ ! -s "${tmp_dir}/${BINARY_NAME}" ]; then
            err "Downloaded file is empty"
            rm -rf "$tmp_dir"
            return 1
        fi

        chmod +x "${tmp_dir}/${BINARY_NAME}"
        ok "Downloaded installer"

        # Run installer with any extra arguments
        info "Launching installer..."
        if [ "$(id -u)" -eq 0 ]; then
            "${tmp_dir}/${BINARY_NAME}" install "$@"
        else
            sudo "${tmp_dir}/${BINARY_NAME}" install "$@"
        fi

        rm -rf "$tmp_dir"
        return 0
    else
        warn "Failed to download pre-built binary"
        rm -rf "$tmp_dir"
        return 1
    fi
}

# Fallback: build from source
build_from_source() {
    info "Attempting to build from source..."

    if ! command -v cargo &>/dev/null; then
        info "Installing Rust toolchain..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        # shellcheck source=/dev/null
        source "$HOME/.cargo/env"
    fi

    if ! command -v git &>/dev/null; then
        err "git is required to build from source"
        exit 1
    fi

    local tmp_dir
    tmp_dir=$(mktemp -d)
    info "Cloning repository..."
    git clone --depth 1 "https://github.com/${REPO}.git" "${tmp_dir}/repo"

    info "Building installer (this may take a few minutes)..."
    cd "${tmp_dir}/repo/installer"
    cargo build --release

    local binary="${tmp_dir}/repo/installer/target/release/${BINARY_NAME}"
    ok "Build complete"

    info "Launching installer..."
    if [ "$(id -u)" -eq 0 ]; then
        "$binary" install "$@"
    else
        sudo "$binary" install "$@"
    fi

    rm -rf "$tmp_dir"
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     RantAI Agents Installer           ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    local arch
    arch=$(detect_arch)
    info "Detected architecture: ${arch}"

    if ! download_installer "$arch" "$@"; then
        warn "Pre-built binary not available, building from source..."
        build_from_source "$@"
    fi
}

main "$@"
