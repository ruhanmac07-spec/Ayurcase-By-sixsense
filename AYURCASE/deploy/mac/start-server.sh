#!/usr/bin/env bash
set -euo pipefail

# SIXSENSE Server Foreground Runner
# Used for direct terminal execution or development testing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_SRC="$SCRIPT_DIR/../../server"

export SIXSENSE_HOST="${SIXSENSE_HOST:-0.0.0.0}"
export SIXSENSE_PORT="${SIXSENSE_PORT:-8443}"
export SIXSENSE_DATA_DIR="${SIXSENSE_DATA_DIR:-$SERVER_SRC/data}"
export RUST_LOG="${RUST_LOG:-info,sixsense_server=debug}"
export PATH="$HOME/.cargo/bin:$PATH"

echo "========================================================="
echo " Starting SIXSENSE Central Server on LAN"
echo " Host: $SIXSENSE_HOST | Port: $SIXSENSE_PORT"
echo " Storage Directory: $SIXSENSE_DATA_DIR"
echo "========================================================="

cd "$SERVER_SRC"
cargo run --release
