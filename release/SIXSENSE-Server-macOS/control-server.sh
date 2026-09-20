#!/bin/bash
# ==============================================================================
# SIXSENSE Server CLI Controller
# Clinical Data & Application Engine
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="$DIR/sixsense-server"
DATA_DIR="/Users/Shared/SIXSENSE"
LOG_FILE="$DATA_DIR/server.log"
PID_FILE="$DATA_DIR/server.pid"
PORT=8443
CONSOLE_URL="http://localhost:$PORT/server-manager"

# Ensure data directory exists
mkdir -p "$DATA_DIR"

is_running() {
    if curl -s -m 2 "http://localhost:$PORT/api/v1/health" > /dev/null 2>&1; then
        return 0
    fi
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

get_lan_ips() {
    ifconfig 2>/dev/null | awk '/inet / && !/127\.0\.0\.1/ {print $2}' | while read -r ip; do
        echo "   • http://$ip:$PORT"
    done
}

start_server() {
    if is_running; then
        echo "⚠️  SIXSENSE Server is ALREADY RUNNING on port $PORT."
        echo "   Local URL: $CONSOLE_URL"
        echo "   Network Client URLs:"
        get_lan_ips
        return 0
    fi

    echo "🚀 Starting SIXSENSE Server..."
    export SIXSENSE_DATA_DIR="$DATA_DIR"
    export RUST_LOG="info"

    nohup "$BINARY" >> "$LOG_FILE" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"
    echo "   Process started with PID: $PID"

    # Wait for server to bind
    for i in {1..10}; do
        if curl -s -m 1 "http://localhost:$PORT/api/v1/health" > /dev/null 2>&1; then
            echo "✅ Server successfully online on port $PORT!"
            echo "   Local URL: $CONSOLE_URL"
            echo "   Network URLs for AYURCASE Windows Clients:"
            get_lan_ips
            return 0
        fi
        sleep 0.5
    done

    echo "⚠️ Server process spawned, but health endpoint not yet responding."
    echo "   Check logs with: ./control-server.sh logs"
}

stop_server() {
    echo "🛑 Stopping SIXSENSE Server..."
    STOPPED=false

    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            kill "$PID" 2>/dev/null || true
            for i in {1..10}; do
                if ! ps -p "$PID" > /dev/null 2>&1; then
                    STOPPED=true
                    break
                fi
                sleep 0.5
            done
            if [ "$STOPPED" = false ]; then
                kill -9 "$PID" 2>/dev/null || true
                STOPPED=true
            fi
        fi
        rm -f "$PID_FILE"
    fi

    # Also check if any sixsense-server process is listening on port 8443
    LSOF_PID=$(lsof -ti :$PORT 2>/dev/null || true)
    if [ -n "$LSOF_PID" ]; then
        kill "$LSOF_PID" 2>/dev/null || true
        sleep 1
        kill -9 "$LSOF_PID" 2>/dev/null || true
        STOPPED=true
    fi

    if is_running; then
        echo "❌ Failed to stop server. Please check running processes manually."
    else
        echo "✅ SIXSENSE Server is stopped."
    fi
}

server_status() {
    echo "=================================================="
    echo "           SIXSENSE SERVER STATUS                 "
    echo "=================================================="
    if is_running; then
        echo "Status:          🟢 ONLINE"
        if [ -f "$PID_FILE" ]; then
            echo "PID:             $(cat "$PID_FILE")"
        fi
        echo "Port:            $PORT"
        echo "Data Directory:  $DATA_DIR"
        echo "Local Console:   $CONSOLE_URL"
        echo "Network Interfaces (Share with AYURCASE Windows Clients):"
        get_lan_ips
        
        # Query status API
        STATUS_JSON=$(curl -s -m 2 "http://localhost:$PORT/api/v1/server-manager/status" 2>/dev/null || true)
        if [ -n "$STATUS_JSON" ]; then
            echo ""
            echo "System Health Diagnostics:"
            echo "$STATUS_JSON"
        fi
    else
        echo "Status:          🔴 OFFLINE"
        echo "Port:            $PORT"
        echo "Data Directory:  $DATA_DIR"
    fi
    echo "=================================================="
}

server_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE"
    fi
    echo "📋 Tailing SIXSENSE Server logs ($LOG_FILE)... Press Ctrl+C to exit."
    tail -n 50 -f "$LOG_FILE"
}

open_console() {
    echo "🌐 Opening SIXSENSE Management Console in browser..."
    open "$CONSOLE_URL"
}

create_backup() {
    echo "💾 Triggering instantaneous database backup..."
    if ! is_running; then
        echo "⚠️ Server is offline. Starting server first or performing file copy..."
        TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
        BACKUP_DIR="$DATA_DIR/backups"
        mkdir -p "$BACKUP_DIR"
        if [ -f "$DATA_DIR/sixsense.db" ]; then
            cp "$DATA_DIR/sixsense.db" "$BACKUP_DIR/sixsense_manual_$TIMESTAMP.db"
            echo "✅ Direct file backup created at $BACKUP_DIR/sixsense_manual_$TIMESTAMP.db"
        else
            echo "❌ No database found at $DATA_DIR/sixsense.db"
        fi
        return 0
    fi

    RESPONSE=$(curl -s -X POST "http://localhost:$PORT/api/v1/server-manager/backup" 2>/dev/null || true)
    if [ -n "$RESPONSE" ]; then
        echo "✅ Backup API Response:"
        echo "$RESPONSE"
    else
        echo "❌ Failed to reach backup API."
    fi
}

case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 1
        start_server
        ;;
    status)
        server_status
        ;;
    logs)
        server_logs
        ;;
    console)
        open_console
        ;;
    backup)
        create_backup
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|console|backup}"
        exit 1
        ;;
esac
