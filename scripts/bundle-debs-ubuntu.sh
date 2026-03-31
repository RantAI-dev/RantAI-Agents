#!/usr/bin/env bash
# Bundle .deb packages for airgap installation on Ubuntu
# Downloads all required packages and their dependencies.
#
# Usage: ./bundle-debs-ubuntu.sh [--output <dir>] [--version 24.04]
set -euo pipefail

OUTPUT_DIR="/tmp/debs"
UBUNTU_VERSION="24.04"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) OUTPUT_DIR="$2"; shift 2 ;;
        --version) UBUNTU_VERSION="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Packages to bundle
PACKAGES=(
    # System essentials
    curl
    ca-certificates
    sudo
    openssl
    git
    unzip
    screen
    lsof
    net-tools
    gnupg
    # PostgreSQL
    postgresql
    postgresql-contrib
    # Docker
    docker-ce
    docker-ce-cli
    containerd.io
    docker-compose-plugin
    docker-buildx-plugin
)

echo "RantAI Agents - DEB Package Bundler"
echo "Target: Ubuntu ${UBUNTU_VERSION}"
echo "Output: ${OUTPUT_DIR}"
echo "Packages: ${#PACKAGES[@]}"
echo ""

mkdir -p "$OUTPUT_DIR"

if command -v docker &>/dev/null; then
    echo "Using Docker to download packages for Ubuntu ${UBUNTU_VERSION}..."

    docker run --rm -v "${OUTPUT_DIR}:/output" "ubuntu:${UBUNTU_VERSION}" bash -c "
        set -e
        export DEBIAN_FRONTEND=noninteractive

        # Add Docker's official GPG key and repo
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg >/dev/null 2>&1

        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \"\$VERSION_CODENAME\") stable\" > /etc/apt/sources.list.d/docker.list

        apt-get update -qq

        # Download packages and all dependencies
        cd /output
        apt-get download ${PACKAGES[*]} 2>/dev/null || true

        # Also download all dependencies recursively
        for pkg in ${PACKAGES[*]}; do
            deps=\$(apt-cache depends --recurse --no-recommends --no-suggests --no-conflicts --no-breaks --no-replaces --no-enhances \"\$pkg\" 2>/dev/null | grep '^\w' | sort -u || true)
            if [ -n \"\$deps\" ]; then
                apt-get download \$deps 2>/dev/null || true
            fi
        done

        echo ''
        echo 'Downloaded packages:'
        ls -1 *.deb 2>/dev/null | wc -l
        du -sh . 2>/dev/null
    "
else
    echo "WARNING: Docker not available. Using local apt-get (may not match target system)."
    echo "For accurate results, run this script on a system with Docker installed."
    echo ""

    cd "$OUTPUT_DIR"
    for pkg in "${PACKAGES[@]}"; do
        apt-get download "$pkg" 2>/dev/null || echo "  WARNING: Could not download $pkg"
    done
fi

echo ""
echo "=== Bundle Report ==="
PACKAGE_COUNT=$(find "$OUTPUT_DIR" -name "*.deb" | wc -l)
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
echo "Packages: ${PACKAGE_COUNT}"
echo "Total size: ${TOTAL_SIZE}"
echo "Output: ${OUTPUT_DIR}"
