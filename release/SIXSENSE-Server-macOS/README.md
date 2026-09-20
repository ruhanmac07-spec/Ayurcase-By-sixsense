# SIXSENSE Server — macOS Production Release (v1.0.0)

**SIXSENSE Server** is the central clinical data and service engine for AYURCASE. It hosts the SQLite database, handles clinical record management, generates OPD numbers, renders sealed clinical prescriptions and case sheets, and manages database backups across the local clinic network.

---

## Architecture Overview

- **Host Machine:** macOS (Apple Silicon M1/M2/M3/M4/M5 or Intel via Rosetta)
- **Port:** `8443` (HTTP over LAN)
- **Database Location:** `/Users/Shared/SIXSENSE/sixsense.db`
- **Backups Location:** `/Users/Shared/SIXSENSE/backups/`
- **Logs Location:** `/Users/Shared/SIXSENSE/server.log`
- **Zero Cloud / Zero Internet Required:** Functions 100% offline within a clinic's local Wi-Fi or Ethernet network.

---

## Package Contents

```
release/SIXSENSE-Server-macOS/
├── SIXSENSE Server.app/      # macOS Application bundle (Double-click to start)
├── sixsense-server          # Standalone release binary (arm64 Mach-O)
├── control-server.sh        # CLI controller (start, stop, restart, status, logs, backup)
├── install-service.sh       # Launchd daemon installer (auto-start on boot)
├── com.sixsense.server.plist# Service definition
├── VERSION                  # Release version (1.0.0)
└── README.md                # This manual
```

---

## Quick Start (Zero-Terminal Operation)

1. **Launch Server:**
   - Double-click **`SIXSENSE Server.app`**.
   - The server process spawns silently in the background and sets its persistent storage to `/Users/Shared/SIXSENSE`.
   - Your default browser automatically opens the **Server Management Console** at `http://localhost:8443/server-manager`.

2. **Connect Windows Clients:**
   - On the Server Management Console, look at the **Detected Network IP Addresses** box.
   - Example: `http://192.168.1.105:8443`
   - Click **"Copy Address"** or note the IP down.
   - Enter this address in the AYURCASE Windows Client settings.

---

## Background Daemon Installation (Auto-Start on Boot)

To ensure the server starts automatically whenever the Mac powers on or reboots, install it as a LaunchAgent:

```bash
# Run inside release/SIXSENSE-Server-macOS/
./install-service.sh
```

To stop and remove the auto-start background service:
```bash
./install-service.sh uninstall
```

---

## Command-Line Server Management

The provided `control-server.sh` script provides full control from the terminal:

| Command | Action |
| :--- | :--- |
| `./control-server.sh start` | Starts server in background, binds port 8443, records PID. |
| `./control-server.sh stop` | Gracefully shuts down the running server. |
| `./control-server.sh restart` | Restarts the server. |
| `./control-server.sh status` | Displays live status, PID, port, database stats, and LAN IPs. |
| `./control-server.sh logs` | Tails the live server log (`server.log`). |
| `./control-server.sh console` | Opens the web management dashboard in your browser. |
| `./control-server.sh backup` | Performs an immediate timestamped SQLite database backup. |

---

## Server Management Console

The built-in web console is available at:
```
http://localhost:8443/server-manager
```

Features:
- **Server Health & Uptime:** Visual status indicator with live heartbeat.
- **LAN IP Display:** Lists all active network adapters with 1-click clipboard copy.
- **Database Telemetry:** Current database size on disk, active file path.
- **Record Counts:** Patients, Visits, Clinical Documents, and Backups stored.
- **Instant Backup:** One-click instant database backup creation.
- **Real-Time Log Viewer:** Tail of recent operational events.

---

## Network & Firewall Configuration

1. **Static IP Recommended:** In clinic router settings, set a DHCP reservation for the Mac Server so its IP address remains constant (e.g., `192.168.1.50`).
2. **macOS Firewall:**
   - Open **System Settings → Network → Firewall**.
   - Ensure incoming connections are permitted for `sixsense-server` or port `8443`.

---

## Backup & Disaster Recovery

- **Automated / Manual Backups:** Saved in `/Users/Shared/SIXSENSE/backups/`.
- **Restoring from Backup:**
  1. Stop the server: `./control-server.sh stop`
  2. Copy the desired backup file to replace `/Users/Shared/SIXSENSE/sixsense.db`:
     ```bash
     cp /Users/Shared/SIXSENSE/backups/sixsense_backup_YYYYMMDD_HHMMSS.db /Users/Shared/SIXSENSE/sixsense.db
     ```
  3. Restart the server: `./control-server.sh start`
