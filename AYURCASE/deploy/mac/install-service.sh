#!/usr/bin/env bash
set -euo pipefail

# SIXSENSE Server macOS Daemon Installer
# Installs launchd service for automatic system startup on Mac M5

echo "==> Configuring SIXSENSE Central Server Directories..."
sudo mkdir -p /Users/Shared/SIXSENSE/{data,documents,backups,logs}
sudo chown -R "$(whoami):staff" /Users/Shared/SIXSENSE

echo "==> Building Release Binary of SIXSENSE Server..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_SRC="$SCRIPT_DIR/../../server"

cd "$SERVER_SRC"
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --release

echo "==> Installing Binary to /usr/local/bin..."
sudo cp target/release/sixsense_server /usr/local/bin/sixsense_server
sudo chmod 755 /usr/local/bin/sixsense_server

echo "==> Installing launchd Plist to ~/Library/LaunchAgents..."
PLIST_SRC="$SCRIPT_DIR/com.sixsense.server.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.sixsense.server.plist"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DEST"

echo "==> Loading launchd Service..."
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "==> SIXSENSE Server successfully installed and active!"
echo "Server LAN Status: http://localhost:8443/api/v1/health"
echo "Logs: /Users/Shared/SIXSENSE/logs/"
