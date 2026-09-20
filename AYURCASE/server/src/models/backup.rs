use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct BackupRecord {
    pub id: String,
    pub target_path: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub status: String,
    pub checksum: Option<String>,
    pub size_bytes: Option<i64>,
    pub verified_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifyBackupResult {
    pub id: String,
    pub status: String,
    pub verified_at: String,
    pub calculated_checksum: String,
    pub stored_checksum: String,
    pub is_valid: bool,
}
