use axum::{
    extract::State,
    response::Html,
    Json,
};
use crate::backup::BackupService;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::models::backup::BackupRecord;
use crate::repositories::DbPool;
use serde::Serialize;
use std::net::UdpSocket;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct ServerManagerStatus {
    pub status: String,
    pub service: String,
    pub version: String,
    pub port: u16,
    pub lan_ips: Vec<String>,
    pub recommended_url: String,
    pub data_dir: String,
    pub db_path: String,
    pub db_size_bytes: u64,
    pub patient_count: i64,
    pub visit_count: i64,
    pub document_count: i64,
    pub backup_count: i64,
    pub recent_logs: Vec<String>,
}

/// Detects local network IP addresses on the host machine
pub fn detect_lan_ips() -> Vec<String> {
    let mut ips = Vec::new();

    // 1. Try macOS/Linux ifconfig command to find active network interfaces
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("ifconfig").output() {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("inet ") {
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if parts.len() >= 2 {
                            let ip = parts[1];
                            if !ip.starts_with("127.") && !ip.starts_with("169.254.") && !ip.is_empty() {
                                if !ips.contains(&ip.to_string()) {
                                    ips.push(ip.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback: UDP routing table resolution
    if ips.is_empty() {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("192.168.1.1:80").is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    let ip = local_addr.ip().to_string();
                    if ip != "0.0.0.0" && !ip.starts_with("127.") {
                        ips.push(ip);
                    }
                }
            }
        }
    }

    // 3. Fallback to loopback if no LAN is connected
    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }

    ips
}

fn read_recent_logs(max_lines: usize) -> Vec<String> {
    let log_candidates = vec![
        PathBuf::from("/Users/Shared/SIXSENSE/logs/server.stdout.log"),
        PathBuf::from("./sixsense_data/server.log"),
        PathBuf::from("./server.log"),
    ];

    for path in log_candidates {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                let start = if lines.len() > max_lines {
                    lines.len() - max_lines
                } else {
                    0
                };
                return lines[start..].to_vec();
            }
        }
    }

    vec![
        "SIXSENSE Server engine running on local network.".to_string(),
        "Listening for connections from Windows AYURCASE clients.".to_string(),
        "Authoritative clinical database: central_ayurcase.db".to_string(),
    ]
}

pub async fn get_server_manager_status(State(pool): State<DbPool>) -> Result<Json<ServerManagerStatus>, AppError> {
    let config = AppConfig::from_env();
    let lan_ips = detect_lan_ips();
    let primary_ip = lan_ips.first().cloned().unwrap_or_else(|| "127.0.0.1".to_string());
    let recommended_url = format!("http://{}:{}", primary_ip, config.port);

    let db_path = config.data_dir.join("central_ayurcase.db");
    let db_size_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    let patient_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM patients")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    let visit_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM visits")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    let document_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clinical_documents")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    let backup_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM backup_records")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    let recent_logs = read_recent_logs(40);

    Ok(Json(ServerManagerStatus {
        status: "RUNNING".to_string(),
        service: "SIXSENSE Server".to_string(),
        version: "1.0.0".to_string(),
        port: config.port,
        lan_ips,
        recommended_url,
        data_dir: config.data_dir.to_string_lossy().to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        db_size_bytes,
        patient_count: patient_count.0,
        visit_count: visit_count.0,
        document_count: document_count.0,
        backup_count: backup_count.0,
        recent_logs,
    }))
}

pub async fn trigger_server_manager_backup(State(pool): State<DbPool>) -> Result<Json<BackupRecord>, AppError> {
    let config = AppConfig::from_env();
    let record = BackupService::trigger_backup(&pool, &config.backups_dir).await?;
    Ok(Json(record))
}

pub async fn get_server_manager_html() -> Html<&'static str> {
    Html(r##"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SIXSENSE Server — Management Console</title>
    <style>
        :root {
            --brand-primary: #1b4332;
            --brand-secondary: #2d6a4f;
            --brand-accent: #40916c;
            --bg-base: #f8fafc;
            --surface-card: #ffffff;
            --border-color: #e2e8f0;
            --text-main: #0f172a;
            --text-muted: #64748b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg-base);
            color: var(--text-main);
            line-height: 1.5;
            padding: 24px;
        }
        .container {
            max-width: 980px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--brand-primary);
        }
        .brand-title {
            font-size: 22px;
            font-weight: 800;
            color: var(--brand-primary);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .brand-badge {
            background: #dcfce7;
            color: #166534;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid #bbf7d0;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        .status-banner {
            background: #ffffff;
            border: 1px solid var(--border-color);
            border-left: 6px solid #16a34a;
            border-radius: 8px;
            padding: 18px 24px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }
        .status-left {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .pulsing-dot {
            width: 14px;
            height: 14px;
            background: #16a34a;
            border-radius: 50%;
            box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7);
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(22, 163, 74, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
        }
        .status-title {
            font-size: 16px;
            font-weight: 700;
            color: #166534;
        }
        .status-sub {
            font-size: 12px;
            color: var(--text-muted);
        }
        .lan-card {
            background: #f0fdf4;
            border: 1.5px solid #86efac;
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 14px;
        }
        .lan-label {
            font-size: 12px;
            font-weight: 700;
            color: #166534;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .lan-url {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 18px;
            font-weight: 800;
            color: #14532d;
            margin-top: 2px;
        }
        .btn {
            background: var(--brand-primary);
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .btn:hover { background: var(--brand-secondary); }
        .btn-outline {
            background: #ffffff;
            color: var(--brand-primary);
            border: 1.5px solid var(--brand-primary);
        }
        .btn-outline:hover { background: #f0fdf4; }
        .grid-3 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-bottom: 20px;
        }
        .card {
            background: var(--surface-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        }
        .card-header {
            font-size: 12px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .metric-big {
            font-size: 26px;
            font-weight: 800;
            color: var(--brand-primary);
        }
        .metric-sub {
            font-size: 11.5px;
            color: var(--text-muted);
            margin-top: 4px;
        }
        .log-box {
            background: #0f172a;
            color: #e2e8f0;
            border-radius: 8px;
            padding: 14px 18px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11.5px;
            line-height: 1.6;
            max-height: 280px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1b4332;
            color: #ffffff;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: none;
            z-index: 100;
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="brand-title">
                SIXSENSE Server
                <span class="brand-badge">macOS Engine</span>
            </div>
            <div>
                <button class="btn btn-outline" onclick="loadStatus()">↻ Refresh Status</button>
            </div>
        </header>

        <!-- Status Banner -->
        <div class="status-banner">
            <div class="status-left">
                <div class="pulsing-dot"></div>
                <div>
                    <div class="status-title" id="statusTitle">SIXSENSE Central Server is Active</div>
                    <div class="status-sub">Listening on 0.0.0.0:8443 • Ready for Windows AYURCASE Workstations</div>
                </div>
            </div>
            <div>
                <span id="versionBadge" style="font-size: 12px; font-weight: 700; color: #475569;">v1.0.0 Production</span>
            </div>
        </div>

        <!-- LAN Connection Card -->
        <div class="lan-card">
            <div>
                <div class="lan-label">Local Area Network (LAN) Connection Address</div>
                <div class="lan-url" id="recUrl">http://...:8443</div>
                <div style="font-size: 11px; color: #166534; margin-top: 3px;">
                    Enter this address in the Windows AYURCASE client under "Server Settings".
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn" onclick="copyAddress()">Copy Server Address</button>
            </div>
        </div>

        <!-- Metrics Grid -->
        <div class="grid-3">
            <div class="card">
                <div class="card-header">
                    <span>Central Database</span>
                    <span style="color: #16a34a; font-weight: 700;">SQLite WAL</span>
                </div>
                <div class="metric-big" id="patientCount">—</div>
                <div class="metric-sub">Registered Patients • <span id="visitCount">—</span> Visits</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 8px; font-family: monospace; word-break: break-all;" id="dbPath">central_ayurcase.db</div>
            </div>

            <div class="card">
                <div class="card-header">
                    <span>Clinical Documents</span>
                    <span style="color: #2563eb; font-weight: 700;">PDF Storage</span>
                </div>
                <div class="metric-big" id="docCount">—</div>
                <div class="metric-sub">Tamper-evident Case Sheets &amp; Prescriptions</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Location: <code>/Users/Shared/SIXSENSE/Patient Data</code></div>
            </div>

            <div class="card">
                <div class="card-header">
                    <span>Backup &amp; Recovery</span>
                    <button class="btn btn-outline" style="padding: 2px 8px; font-size: 11px;" onclick="triggerBackup()">Backup Now</button>
                </div>
                <div class="metric-big" id="backupCount">—</div>
                <div class="metric-sub">Archived Snapshots Verified</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Auto-saved to: <code>/Users/Shared/SIXSENSE/backups</code></div>
            </div>
        </div>

        <!-- Live Server Log Console -->
        <div class="card" style="margin-bottom: 24px;">
            <div class="card-header">
                <span>Operational Activity Logs</span>
                <span style="font-size: 11px; text-transform: none; color: #64748b;">Auto-refreshes every 3 seconds</span>
            </div>
            <div class="log-box" id="logBox">Loading server activity logs...</div>
        </div>

        <div style="text-align: center; font-size: 11.5px; color: #94a3b8; padding-top: 12px; border-top: 1px solid var(--border-color);">
            SIXSENSE Server • AYURCASE Local Area Network Engine • Internet Not Required for Clinical Workflow
        </div>
    </div>

    <div class="toast" id="toast">Address copied to clipboard!</div>

    <script>
        let currentUrl = '';

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; }, 2800);
        }

        function copyAddress() {
            if (currentUrl) {
                navigator.clipboard.writeText(currentUrl).then(() => {
                    showToast('Copied: ' + currentUrl);
                }).catch(() => {
                    showToast('Address: ' + currentUrl);
                });
            }
        }

        async function triggerBackup() {
            try {
                const res = await fetch('/api/v1/server-manager/backup', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    showToast('Backup created: ' + data.target_path.split('/').pop());
                    loadStatus();
                } else {
                    showToast('Backup failed with status ' + res.status);
                }
            } catch (e) {
                showToast('Backup request failed: ' + e.message);
            }
        }

        async function loadStatus() {
            try {
                const res = await fetch('/api/v1/server-manager/status');
                if (res.ok) {
                    const data = await res.json();
                    currentUrl = data.recommended_url;
                    document.getElementById('recUrl').innerText = data.recommended_url;
                    document.getElementById('patientCount').innerText = data.patient_count;
                    document.getElementById('visitCount').innerText = data.visit_count;
                    document.getElementById('docCount').innerText = data.document_count;
                    document.getElementById('backupCount').innerText = data.backup_count;
                    document.getElementById('dbPath').innerText = data.db_path;

                    if (data.recent_logs && data.recent_logs.length > 0) {
                        const box = document.getElementById('logBox');
                        box.innerText = data.recent_logs.join('\n');
                        box.scrollTop = box.scrollHeight;
                    }
                }
            } catch (err) {
                document.getElementById('statusTitle').innerText = 'Reconnecting to Server...';
                document.getElementById('statusTitle').style.color = '#b45309';
            }
        }

        loadStatus();
        setInterval(loadStatus, 3000);
    </script>
</body>
</html>"##)
}
