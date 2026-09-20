#!/bin/bash
# ==============================================================================
# SIXSENSE Server Launchd Service Installer
# Installs SIXSENSE as an automatic background service on macOS
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="$DIR/sixsense-server"
PLIST_SRC="$DIR/com.sixsense.server.plist"
DATA_DIR="/Users/Shared/SIXSENSE"
BIN_DIR="$DATA_DIR/bin"
PLIST_DEST="$HOME/Library/LaunchAgents/com.sixsense.server.plist"

if [ "$1" = "uninstall" ]; then
    echo "🗑️  Uninstalling SIXSENSE Server Launchd Service..."
    if [ -f "$PLIST_DEST" ]; then
        launchctl unload "$PLIST_DEST" 2>/dev/null || true
        rm -f "$PLIST_DEST"
    fi
    echo "✅ Service uninstalled. Data in $DATA_DIR has been preserved."
    exit 0
fi

echo "📦 Installing SIXSENSE Server background service..."

# 1. Create directory structure
mkdir -p "$BIN_DIR"
mkdir -p "$DATA_DIR/backups"
mkdir -p "$HOME/Library/LaunchAgents"

# 2. Copy binary to permanent shared location
echo "   Copying server binary to $BIN_DIR/sixsense-server..."
cp "$BINARY" "$BIN_DIR/sixsense-server"
chmod +x "$BIN_DIR/sixsense-server"

# 3. Unload existing service if already loaded
if [ -f "$PLIST_DEST" ]; then
    echo "   Unloading existing service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# 4. Install plist
echo "   Installing launchd definition to $PLIST_DEST..."
cp "$PLIST_SRC" "$PLIST_DEST"

# 5. Load service
echo "   Starting service with launchctl..."
launchctl load -w "$PLIST_DEST"

# 6. Verify health
echo "   Verifying server health..."
SUCCESS=false
for i in {1..10}; do
    if curl -s -m 1 "http://localhost:8443/api/v1/health" > /dev/null 2>&1; then
        SUCCESS=true
        break
    fi
    sleep 0.5
done

if [ "$SUCCESS" = true ]; then
    echo "=================================================="
    echo "🎉 SIXSENSE Server Service installed successfully!"
    echo "   Status:      🟢 ONLINE & AUTO-STARTING ON BOOT"
    echo "   Console:     http://localhost:8443/server-manager"
    echo "   Data:        $DATA_DIR"
    echo "   Logs:        $DATA_DIR/server.log"
    echo "   Uninstall:   ./install-service.sh uninstall"
    echo "=================================================="
else
    echo "⚠️ Service registered, but waiting for health check."
    echo "   Inspect logs at: $DATA_DIR/server.log"
fi
