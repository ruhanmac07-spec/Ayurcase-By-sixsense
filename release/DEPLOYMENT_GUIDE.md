# AYURCASE + SIXSENSE: Clinic Deployment Guide

## Production Release v1.0.0

This guide details the deployment of **SIXSENSE Server** on a central macOS computer and **AYURCASE Client** across multiple Windows workstations on a local clinic network.

---

## 1. System Architecture & Topology

```
                         ┌─────────────────────────────────┐
                         │       Clinic Wi-Fi Router       │
                         │          or LAN Switch          │
                         │     (No Internet Required)      │
                         └───────────────┬─────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
┌───────▼────────────────────────┐ ┌─────▼──────────────────┐ ┌───────────▼──────────────────┐
│   macOS M-Series (Central)     │ │  Windows Workstation 1 │ │  Windows Workstation 2       │
│        SIXSENSE SERVER         │ │    AYURCASE (Doctor)   │ │    AYURCASE (Reception)      │
│   • Local SQLite Database      │ │    • Real-time REST    │ │    • Patient Registration    │
│   • Port 8443 LAN Service      │ │    • Consultation      │ │    • Appointments & Queue    │
│   • Auto-Backups & Web Console │ │    • Prescriptions     │ │    • Billing & Case Sheets   │
└────────────────────────────────┘ └────────────────────────┘ └──────────────────────────────┘
```

### Key Principles
1. **100% Offline Capability:** Operates entirely over local Wi-Fi or Ethernet without an active internet connection.
2. **Centralized Clinical State:** All records, visits, OPD numbers, and prescriptions are atomically stored on the macOS server.
3. **Multi-Operator Concurrency:** Multiple doctors and receptionists can access the system simultaneously without conflict.

---

## 2. Server Deployment (macOS M-Series)

### Requirements
- Apple Silicon Mac (M1/M2/M3/M4/M5) or Intel Mac running macOS 12 Monterey or later.
- Static LAN IP address or DHCP reservation configured in the clinic router (recommended: e.g., `192.168.1.50`).

### Deployment Steps
1. Copy the `release/SIXSENSE-Server-macOS/` folder to the Mac (e.g. `/Applications/SIXSENSE` or desktop).
2. **Option A (Desktop App):**
   - Double-click **`SIXSENSE Server.app`**.
   - A notification will appear, and your default web browser will open `http://localhost:8443/server-manager`.
3. **Option B (Auto-Starting System Service - Recommended):**
   - Open Terminal in `release/SIXSENSE-Server-macOS/`.
   - Run:
     ```bash
     ./install-service.sh
     ```
   - This registers `com.sixsense.server` with macOS `launchd`. The server will now automatically start when the Mac boots.
4. **Note Down the Server LAN IP:**
   - In the Server Management Console (`http://localhost:8443/server-manager`), note down the IP address listed under **Detected Network IP Addresses** (e.g., `http://192.168.1.105:8443`).

---

## 3. Client Deployment (Windows 10/11 Workstations)

### Requirements
- Windows 10 (version 1809 or higher) or Windows 11 (64-bit).
- Connected to the same clinic Wi-Fi or Ethernet network as the Mac server.
- Microsoft Edge WebView2 (standard on modern Windows).

### Deployment Steps
1. On each clinic PC, run `AYURCASE_1.0.0_x64-setup.exe`.
2. Complete the installer. AYURCASE will create a desktop and Start Menu shortcut.
3. Launch **AYURCASE**.
4. In the top navigation bar, click the **Settings (gear)** icon or click the **Connection Status Badge**.
5. Enter the Server Address obtained from Step 2:
   ```
   http://192.168.1.105:8443
   ```
   *(Note: entering simply `192.168.1.105` will automatically be formatted with port 8443).*
6. Click **Save and Connect**.
7. The status badge will change from 🟡 `CONNECTING` to 🟢 `CONNECTED`.

---

## 4. Multi-Workstation Verification Checklist

To verify the setup is operating correctly:

1. **Reception Check:**
   - Register a new patient on the Reception PC.
   - Verify the generated Patient Code (e.g., `P-2026-0001`).
2. **Doctor Consultation Check:**
   - Open the Patient Queue on Doctor Workstation 1.
   - The newly registered patient appears immediately.
   - Start consultation, input clinical findings, and generate a Prescription.
3. **Document Rendering Check:**
   - Open the generated prescription.
   - Verify OPD Number follows `PATIENT_CODE/DD/MM/YYYY` format.
   - Verify date formatting is strictly `DD/MM/YYYY`.
   - Verify no raw database IDs or `vis_` UUIDs appear on printable documents.
4. **Offline Resilience Check:**
   - Disconnect the clinic router's WAN cable (turn off internet).
   - Perform patient lookups, record new vitals, and print documents.
   - Notice zero disruption or degradation.

---

## 5. Daily Backup & Disaster Recovery Routine

- **Automated Storage:** Database files are stored at `/Users/Shared/SIXSENSE/sixsense.db`.
- **Manual Backups:**
  - In the Server Management Console, click **"Trigger Backup Now"**.
  - Or run `./control-server.sh backup` from the terminal.
  - Or set up a daily copy of `/Users/Shared/SIXSENSE/backups/` to an external drive or USB stick.
- **Disaster Recovery:**
  - If the server Mac ever needs replacement, simply install the server on a new Mac and place the latest backup `.db` into `/Users/Shared/SIXSENSE/sixsense.db`.
