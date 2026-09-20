# AYURCASE + SIXSENSE: Troubleshooting Matrix

This guide provides definitive diagnostic and remediation steps for network, service, and client connectivity issues.

---

## 1. Quick Diagnostic Flowchart

```
[Client Shows Badge]
       │
       ├─► 🟢 CONNECTED ────────────► System fully operational.
       │
       ├─► 🟡 CONNECTING ───────────► Check Wi-Fi/Ethernet link to clinic router.
       │
       ├─► 🔴 DISCONNECTED ─────────► Client network interface is OFF or unplugged.
       │
       ├─► 🟠 RECONNECTING ─────────► Handshake lost; verifying server reachability.
       │
       ├─► 🔴 SERVER_UNAVAILABLE ───► Mac is online, but SIXSENSE Server process is stopped.
       │                              Run `./control-server.sh start` on Mac.
       │
       └─► 🟣 AUTH_REQUIRED ────────► Doctor/Staff session expired; re-login on workstation.
```

---

## 2. Issue Resolution Matrix

### Issue 1: "Server Unavailable" or Client cannot reach Server
- **Cause A: SIXSENSE Server is not running on the Mac.**
  - **Fix:** On the Mac, run `./control-server.sh status`. If offline, execute `./control-server.sh start` or double-click `SIXSENSE Server.app`.
- **Cause B: Mac Server IP address changed.**
  - **Fix:** If the clinic router assigned a new dynamic IP, open the Server Console (`http://localhost:8443/server-manager`) on the Mac to view the new IP. In AYURCASE on Windows, click the connection badge and update the IP. *Recommendation: Set a DHCP Reservation on your clinic router for the Mac.*
- **Cause C: macOS Firewall is blocking Port 8443.**
  - **Fix:** On macOS, open **System Settings → Network → Firewall → Options**. Add `sixsense-server` or permit incoming connections for the application.

---

### Issue 2: Windows Client Displays "Disconnected"
- **Cause:** The Windows workstation has lost network access.
  - **Fix:** Check the Ethernet cable or Wi-Fi status in the Windows taskbar. Ensure the PC is connected to the same clinic network SSID as the Mac server.

---

### Issue 3: Windows Defender Firewall Prompt Was Dismissed or Blocked
- **Symptom:** Client cannot connect to any IP on port 8443.
- **Fix:**
  1. Open Windows Search and type **Windows Defender Firewall with Advanced Security**.
  2. Click **Inbound Rules** and **Outbound Rules**.
  3. Ensure `AYURCASE` is set to **Allow**.
  4. Ensure network type is set to **Private** in Windows Network Settings.

---

### Issue 4: Address Already In Use (Error: Os { code: 48, kind: AddrInUse })
- **Cause:** An orphaned instance of `sixsense-server` is still holding port 8443.
- **Fix:**
  - Run:
    ```bash
    ./control-server.sh restart
    ```
  - Or manually terminate any process on port 8443:
    ```bash
    lsof -ti:8443 | xargs kill -9
    ```

---

### Issue 5: Port 8443 Ping / Connectivity Test from Windows
To verify network connectivity directly from a Windows workstation:
1. Open PowerShell on Windows.
2. Run:
   ```powershell
   Test-NetConnection -ComputerName 192.168.1.105 -Port 8443
   ```
3. If `TcpTestSucceeded : True`, the network path and port are completely open.
4. Test the health endpoint:
   ```powershell
   Invoke-RestMethod -Uri http://192.168.1.105:8443/api/v1/health
   ```
   Should return: `{"status":"healthy", ...}`.

---

### Issue 6: Restoring After System Crash or Power Failure
- SQLite databases are ACID compliant and crash-resilient with WAL (Write-Ahead Logging).
- In the event of a sudden power outage:
  1. Reboot the Mac Server.
  2. Launch `SIXSENSE Server.app` (or it will auto-launch if `install-service.sh` was run).
  3. The database engine automatically recovers uncommitted transactions on startup.
  4. Access `http://localhost:8443/server-manager` to confirm database integrity and record counts.
