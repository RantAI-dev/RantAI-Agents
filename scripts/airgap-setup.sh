#!/usr/bin/env bash
# RantAI Agents - Airgap Setup Script
# This script is included inside the self-extracting airgap bundle.
# It launches the installer binary with airgap flags.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "RantAI Agents - Airgap Installation"
echo "Bundle directory: ${SCRIPT_DIR}"
echo ""

# Ensure installer binary exists and is executable
INSTALLER="${SCRIPT_DIR}/rantai-agents-installer"
if [ ! -f "$INSTALLER" ]; then
    echo "ERROR: Installer binary not found at ${INSTALLER}"
    exit 1
fi
chmod +x "$INSTALLER"

# Run with elevated privileges if needed
if [ "$(id -u)" -eq 0 ]; then
    "$INSTALLER" install --airgap --bundle-path "${SCRIPT_DIR}" "$@"
else
    sudo "$INSTALLER" install --airgap --bundle-path "${SCRIPT_DIR}" "$@"
fi
