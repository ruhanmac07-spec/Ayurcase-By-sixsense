# AYURCASE Phase 2 — Backup, Integrity Verification, & Disaster Recovery Runbook

## 1. Storage & Database Architecture

AYURCASE Phase 2 centralizes all clinical encounters, patients, documents, and audit trails in a single embedded SQLite database owned exclusively by the **SIXSENSE Server**.

Key SQLite Engine Configuration:
- `PRAGMA foreign_keys = ON;`: Enforces relational integrity across all 20 tables.
- `PRAGMA journal_mode = WAL;`: Write-Ahead Logging allows concurrent reads while writes are occurring without database lockups.
- `PRAGMA busy_timeout = 5000;`: Concurrency resilience with 5-second automatic retries on contention.

---

## 2. Verifiable Online Backup Architecture

### 2.1 Atomic Snapshot Mechanism (`VACUUM INTO`)
Rather than copying the active `.db` and `.db-wal` files (which risks capturing a corrupt partial state), SIXSENSE Server executes the official SQLite command:
```sql
VACUUM INTO '/Users/Shared/SIXSENSE/backups/backup_YYYYMMDD_HHMMSS.sqlite';
```
This guarantees:
1. Complete transactional consistency at the instant of execution.
2. Defragmentation and compacting of unused pages.
3. Completely non-blocking execution relative to concurrent doctor consultations.

### 2.2 Cryptographic Integrity Assurance (SHA-256)
Immediately following the `VACUUM INTO` command, the server reads the snapshot archive file and computes its SHA-256 checksum:
```rust
let mut hasher = Sha256::new();
let mut file = std::fs::File::open(&target_path)?;
std::io::copy(&mut file, &mut hasher)?;
let checksum = format!("{:x}", hasher.finalize());
```
This checksum is stored permanently in the `backup_records` database table.

---

## 3. How to Trigger & Verify Backups

### 3.1 Via Graphical User Interface (System Authority)
1. Log into AYURCASE as an **Authority** account (`admin`).
2. Select **Backups & Recovery** from the left navigation.
3. Click **Create Immediate Backup**.
4. The new record appears in the table with execution timestamp, exact byte size, and SHA-256 hash.
5. Click **Verify Hash**. The server reads the archive from disk, recomputes the SHA-256 hash byte-by-byte, and confirms whether the file has suffered bitrot or modification.

### 3.2 Automated Scheduled Execution
The server can also be triggered automatically via a standard cron job or launchd calendar interval on the Mac M5 host:
```bash
# Example crontab entry (daily at 21:00 / 9 PM)
0 21 * * * curl -s -X POST -H "Authorization: Bearer <AUTHORITY_TOKEN>" http://localhost:8443/api/v1/backups/run
```

---

## 4. Disaster Recovery Procedure (Restoring Database)

If the server hardware encounters failure or the primary database is compromised, follow these exact steps to restore:

### Step 1: Stop SIXSENSE Server Daemon
```bash
launchctl unload ~/Library/LaunchAgents/com.sixsense.server.plist
# Or terminate the foreground process: killall sixsense_server
```

### Step 2: Identify the Intact Backup Snapshot
Inspect `/Users/Shared/SIXSENSE/backups/`:
```bash
ls -lh /Users/Shared/SIXSENSE/backups/
```
Select the latest snapshot, e.g., `backup_20260908_180000.sqlite`.

### Step 3: Cryptographically Verify the File Hash
Verify the SHA-256 hash of the chosen backup using macOS built-in `shasum`:
```bash
shasum -a 256 /Users/Shared/SIXSENSE/backups/backup_20260908_180000.sqlite
```
Compare the resulting hash with the recorded hash from the audit log or administrator report.

### Step 4: Replace Active Database
Safely archive the damaged database and replace it with the verified snapshot:
```bash
cd /Users/Shared/SIXSENSE/data/

# Move damaged files to a quarantine folder
mkdir -p quarantine/
mv sixsense.db* quarantine/ 2>/dev/null || true

# Copy verified snapshot as primary database
cp /Users/Shared/SIXSENSE/backups/backup_20260908_180000.sqlite ./sixsense.db
chmod 644 ./sixsense.db
```

### Step 5: Start SIXSENSE Server Daemon
```bash
launchctl load ~/Library/LaunchAgents/com.sixsense.server.plist
```

### Step 6: Verify Database Health
Check the server health endpoint:
```bash
curl http://localhost:8443/api/v1/health
```
Ensure the response outputs: `"database": "CONNECTED"`.
Launch the AYURCASE client on any clinic workstation and confirm historical encounters and queues are intact.
