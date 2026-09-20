# AYURCASE Client — Windows Production Release (v1.0.0)

**AYURCASE Client** is the practitioner and clinic workstation desktop application built with Tauri 2 and React. It connects across the clinic's local area network (LAN) to the central **SIXSENSE Server** hosted on macOS.

---

## Architecture Overview

- **Target OS:** Windows 10 (version 1809+) or Windows 11 (64-bit)
- **Framework:** Tauri 2 Native Desktop Application with Microsoft Edge WebView2
- **Network Protocol:** HTTP REST API over LAN (Port 8443)
- **Zero Cloud / Zero Internet Required:** Functions 100% offline within the clinic's local network (Wi-Fi or Ethernet).

---

## Package Structure

```
release/AYURCASE-Windows/
├── build-windows.bat          # Turnkey 1-click Windows build script
├── build-windows.ps1          # PowerShell turnkey build script
├── VERSION                    # Client release version (1.0.0)
├── README.md                  # This installation and deployment guide
└── client/                    # Application source and pre-bundled distribution
    ├── dist/                  # Pre-compiled production React/Vite assets (no npm build needed!)
    ├── src-tauri/             # Native Tauri 2 Windows configuration and Rust backend
    └── package.json           # Frontend package definitions
```

---

## Building the Windows Installer

### Option A: Local Windows Machine (Turnkey 1-Click)
1. Copy the `release/AYURCASE-Windows` folder to any Windows 10/11 development or build machine.
2. Ensure you have installed:
   - **Rust & Cargo** (from https://rustup.rs/ with C++ Build Tools)
   - **Node.js 18+** (Optional: pre-bundled frontend assets are already present in `client/dist/`)
3. Double-click **`build-windows.bat`** (or run `.\build-windows.ps1` in PowerShell).
4. The script will automatically compile the native Windows executable and generate the NSIS setup installer (`.exe`) and `.msi` in `release/AYURCASE-Windows/installer/`.

### Option B: GitHub Actions Cloud Build
A pre-configured CI workflow is located at `.github/workflows/release-windows.yml`. When pushed to GitHub, it will automatically build and publish the Windows `.exe` and `.msi` installers under GitHub Releases / Actions Artifacts.

---

## Installation on Clinical Workstations

1. On each clinic Windows computer (e.g. Reception PC, Doctor Consultation PCs):
   - Run the generated `AYURCASE_1.0.0_x64-setup.exe` installer.
   - Follow the prompt (installs to current user, no administrative privileges required).
   - Launch **AYURCASE** from the Start Menu or Desktop shortcut.

---

## Connecting to SIXSENSE Server

1. **Find Server IP:**
   - On the Mac hosting SIXSENSE Server, check the **Server Management Console** (`http://localhost:8443/server-manager`).
   - Copy the detected LAN IP address (e.g. `http://192.168.1.105:8443`).

2. **Configure in AYURCASE:**
   - When AYURCASE launches on Windows, click the **Settings (gear icon)** or the **Connection Badge** in the top bar.
   - Enter the server address (you can simply enter `192.168.1.105` or `http://192.168.1.105:8443`). The app will automatically normalize and test the port.
   - Click **"Save and Connect"**.

---

## Connection States & Indicators

AYURCASE features an automated connection lifecycle manager:

| Indicator Badge | State | Description |
| :--- | :--- | :--- |
| 🟡 Pulse | `CONNECTING` | Establishing handshake with SIXSENSE Server. |
| 🟢 Green | `CONNECTED` | Full real-time synchronization with server database. |
| 🔴 Red | `DISCONNECTED` | Workstation network interface is offline (e.g., Wi-Fi disconnected). |
| 🟠 Amber Pulse | `RECONNECTING` | Re-establishing contact with server after temporary interruption. |
| 🔴 Red Alert | `SERVER_UNAVAILABLE` | Mac server is reachable on network but SIXSENSE service is stopped. |
| 🟣 Purple Alert | `AUTH_REQUIRED` | Session token expired; re-authentication required. |

---

## Windows Firewall Configuration

The first time AYURCASE connects to the LAN, Windows Defender Firewall may display a security alert:
- Check the box: **"Private networks, such as my home or work network"**.
- Click **"Allow access"**.
- If connection fails, ensure port `8443` is permitted in Windows Defender Firewall outbound rules.
