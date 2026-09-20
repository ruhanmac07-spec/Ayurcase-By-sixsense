# AYURCASE Phase 2 — LAN Deployment & Operational Architecture Guide

## 1. System Topology Overview

AYURCASE operates strictly over a localized Local Area Network (LAN) using Ethernet or Wi-Fi. It has **zero cloud dependency**, **zero external telemetry**, and **zero LLM/cloud AI integration**.

```
                           +-----------------------------------------------+
                           |          SIXSENSE Central Server              |
                           |       (macOS M5 Host / 0.0.0.0:8443)          |
                           |                                               |
                           |  +----------------+     +-------------------+ |
                           |  | Axum REST API  |     | Central SQLite    | |
                           |  | (/api/v1)      | <-> | (WAL Mode)        | |
                           |  +----------------+     +-------------------+ |
                           |          |                        |           |
                           |  +----------------+     +-------------------+ |
                           |  | Document Vault |     | Verifiable Backup | |
                           |  | (SHA-256 Case) |     | (VACUUM INTO)     | |
                           |  +----------------+     +-------------------+ |
                           +-----------------------------------------------+
                                      |                     |
                   LAN HTTP/JSON (Port 8443)    LAN HTTP/JSON (Port 8443)
                                      |                     |
             +------------------------+                     +------------------------+
             |                                                                       |
             v                                                                       v
+-----------------------------+                                         +-----------------------------+
|    AYURCASE Client #1       |                                         |    AYURCASE Client #2       |
| (Doctor Consultation Room)  |                                         |  (Reception / Triage Desk)  |
|  - Windows 11 Desktop (MSI) |                                         |  - Windows 11 Desktop (MSI) |
|  - Tauri 2 + React + Vite   |                                         |  - Tauri 2 + React + Vite   |
|  - Role: DOCTOR             |                                         |  - Role: ASSISTANT          |
+-----------------------------+                                         +-----------------------------+
```

---

## 2. Server Deployment on macOS (Mac M5 Host)

### 2.1 Static IP Reservation
Assign a static or DHCP-reserved IP to the host Mac on your clinic router:
- Example: `192.168.1.100`
- Confirm via macOS Terminal:
  ```bash
  ipconfig getifaddr en0
  # Output: 192.168.1.100
  ```

### 2.2 Host Directory Layout
The server maintains dedicated data, document storage, and backup directories at `/Users/Shared/SIXSENSE`:
```
/Users/Shared/SIXSENSE/
├── data/
│   ├── sixsense.db          # Primary SQLite database (WAL mode)
│   ├── sixsense.db-wal      # Write-Ahead Log
│   └── sixsense.db-shm      # Shared memory index
├── documents/
│   └── doc_*.pdf            # Generated clinical case sheets (SHA-256 hashed)
├── backups/
│   └── backup_*.sqlite      # Atomic snapshots produced via VACUUM INTO
└── logs/
    ├── server.stdout.log    # Server stdout
    └── server.stderr.log    # Server stderr
```

### 2.3 Automatic System Service (launchd)
To install and start SIXSENSE Server as a persistent daemon that boots on Mac startup:
```bash
cd AYURCASE/deploy/mac
./install-service.sh
```

To verify the daemon is running:
```bash
launchctl list | grep sixsense
curl http://localhost:8443/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "sixsense_server",
  "version": "1.0.0",
  "database": "CONNECTED"
}
```

### 2.4 macOS Firewall Configuration
Ensure port `8443` accepts incoming LAN connections:
1. Open **System Settings** -> **Network** -> **Firewall**.
2. Allow incoming connections for `sixsense_server` or add an incoming rule for TCP port `8443`.

---

## 3. Windows Client Installation & Setup

### 3.1 Packaging the Windows Installer
AYURCASE Client is built with **Tauri 2** and packaged as a native Windows `.msi` or `.exe` installer.

From a Windows workstation with Rust and Node.js installed (or via CI cross-compilation):
```powershell
cd AYURCASE\client
npm install
npm run tauri build
```
The resulting installer is generated at:
`AYURCASE\client\src-tauri\target\release\bundle\msi\ayurcase-app_1.0.0_x64_en-US.msi`

### 3.2 Distributing to Clinic Workstations
1. Copy the `.msi` installer to each clinic PC (Reception, Doctor Chambers, Administrative office).
2. Double-click the MSI to install AYURCASE to `%ProgramFiles%\AYURCASE`.
3. Launch AYURCASE from the Start Menu or Desktop shortcut.

### 3.3 Initial Connection Discovery
On first launch, AYURCASE displays the connection status indicator on the login screen:
1. Click the **Config** button in the connection pill.
2. Enter the macOS Server LAN IP address and port:
   ```
   http://192.168.1.100:8443
   ```
3. Click **Test LAN Connection**. The client executes an immediate ping to `/api/v1/health`.
4. Click **Save & Connect**. The address is stored in local client storage and remembered across restarts.

---

## 4. Multi-Client Concurrency Verification Runbook

Follow these steps to validate seamless concurrent operation across multiple clinic stations:

### Test Case 1: Concurrent Assistant Intake & Doctor Consultation
1. **Station A (Reception - Assistant Priya)**:
   - Search for a patient or register new patient `"Devendra Joshi"`.
   - Record vitals (BP: 130/84, Pulse: 76, Weight: 74 kg).
   - Assign to Dr. Sharma's queue.
2. **Station B (Doctor Chamber - Dr. Sharma)**:
   - Observe Dr. Sharma's queue refreshes and displays Token # with patient `"Devendra Joshi"`.
   - Click **Start Consultation**.
   - The queue entry transitions to `IN_CONSULTATION` across both stations.

### Test Case 2: Deterministic Rule Provenance & Save Invariant
1. In Dr. Sharma's consultation workspace:
   - Select diagnosis `AYU_AMAVATA` (Amavata / Rheumatoid Arthritis).
   - The system displays the validated rule card citing **CCRAS Class A** and **Ayurvedic Pharmacopoeia of India (API) v1.0**.
   - Click **Apply Validated Protocol**.
   - Add clinical notes.
   - Click **Finalize Consultation & Seal Case Sheet**.
   - The server creates the prescription, changes visit status to `FINALIZED`, locks all editing, and generates the sealed document with a computed SHA-256 hash.

### Test Case 3: Zero-Disruption Database Backup During Active Sessions
1. While Doctor and Assistant are logged in:
   - Log in as **System Authority** on Station C.
   - Navigate to **Backups & Recovery**.
   - Click **Create Immediate Backup**.
   - The server executes `VACUUM INTO` in the background using SQLite WAL mode.
   - Active client requests continue without latency or query blocking.
   - Click **Verify Hash** to independently recalculate and confirm the SHA-256 integrity checksum.

### Test Case 4: Network Outage & Reconnect Handling
1. Disconnect the Wi-Fi or Ethernet cable on Station B (Doctor workstation).
2. The UI immediately displays the calm amber alert banner:
   > *"LAN Connection Disrupted — Consulting buffer preserved locally. Reconnecting in 3s..."*
3. Form input remains editable and unblocked; no data is lost.
4. Re-plug the network cable. Within seconds, the client detects restored heartbeat and resumes synchronized operations.
