use crate::error::AppError;
use crate::models::backup::{BackupRecord, VerifyBackupResult};
use crate::repositories::DbPool;
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use uuid::Uuid;

pub struct BackupService;

impl BackupService {
    pub async fn trigger_backup(
        pool: &DbPool,
        backups_dir: &Path,
    ) -> Result<BackupRecord, AppError> {
        let backup_id = format!("bkp_{}", Uuid::now_v7());
        let now = Utc::now();
        let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
        let target_file = backups_dir.join(format!("sixsense_backup_{}.db", timestamp));
        let target_path_str = target_file.to_string_lossy().to_string();

        // 1. Record RUNNING state
        sqlx::query(
            "INSERT INTO backup_records (id, target_path, started_at, status)
             VALUES (?, ?, ?, 'RUNNING')"
        )
        .bind(&backup_id)
        .bind(&target_path_str)
        .bind(now.to_rfc3339())
        .execute(pool)
        .await?;

        // 2. Perform SQLite online backup using VACUUM INTO
        let vacuum_sql = format!("VACUUM INTO '{}';", target_path_str);
        if let Err(e) = sqlx::query(&vacuum_sql).execute(pool).await {
            let err_msg = format!("VACUUM INTO failed: {}", e);
            sqlx::query(
                "UPDATE backup_records 
                 SET status = 'FAILED', error_message = ?, completed_at = ?
                 WHERE id = ?"
            )
            .bind(&err_msg)
            .bind(Utc::now().to_rfc3339())
            .bind(&backup_id)
            .execute(pool)
            .await?;

            return Err(AppError::Internal(err_msg));
        }

        // 3. Compute SHA256 checksum and size
        let (checksum, size_bytes) = match calculate_checksum_and_size(&target_file) {
            Ok(res) => res,
            Err(e) => {
                let err_msg = format!("Checksum calculation failed: {}", e);
                sqlx::query(
                    "UPDATE backup_records 
                     SET status = 'FAILED', error_message = ?, completed_at = ?
                     WHERE id = ?"
                )
                .bind(&err_msg)
                .bind(Utc::now().to_rfc3339())
                .bind(&backup_id)
                .execute(pool)
                .await?;

                return Err(AppError::Internal(err_msg));
            }
        };

        // 4. Update SUCCESS state
        let completed_at = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE backup_records 
             SET status = 'SUCCESS', checksum = ?, size_bytes = ?, completed_at = ?, verified_at = ?
             WHERE id = ?"
        )
        .bind(&checksum)
        .bind(size_bytes as i64)
        .bind(&completed_at)
        .bind(&completed_at)
        .bind(&backup_id)
        .execute(pool)
        .await?;

        Ok(BackupRecord {
            id: backup_id,
            target_path: target_path_str,
            started_at: now.to_rfc3339(),
            completed_at: Some(completed_at.clone()),
            status: "SUCCESS".to_string(),
            checksum: Some(checksum),
            size_bytes: Some(size_bytes as i64),
            verified_at: Some(completed_at),
            error_message: None,
        })
    }

    pub async fn verify_backup(
        pool: &DbPool,
        backup_id: &str,
    ) -> Result<VerifyBackupResult, AppError> {
        let record: Option<BackupRecord> = sqlx::query_as(
            "SELECT id, target_path, started_at, completed_at, status, checksum, size_bytes, verified_at, error_message
             FROM backup_records WHERE id = ?"
        )
        .bind(backup_id)
        .fetch_optional(pool)
        .await?;

        let rec = match record {
            Some(r) => r,
            None => return Err(AppError::NotFound(format!("Backup record '{}' not found", backup_id))),
        };

        let stored_checksum = rec.checksum.unwrap_or_default();
        let target_path = Path::new(&rec.target_path);

        if !target_path.exists() {
            return Err(AppError::NotFound(format!(
                "Backup file '{}' no longer exists on filesystem",
                rec.target_path
            )));
        }

        let (calculated_checksum, _) = calculate_checksum_and_size(target_path)
            .map_err(|e| AppError::Internal(format!("Failed to read backup file: {}", e)))?;

        let is_valid = !stored_checksum.is_empty() && stored_checksum == calculated_checksum;
        let verified_at = Utc::now().to_rfc3339();
        let status = if is_valid { "SUCCESS" } else { "VERIFICATION_FAILED" };

        sqlx::query(
            "UPDATE backup_records 
             SET status = ?, verified_at = ?
             WHERE id = ?"
        )
        .bind(status)
        .bind(&verified_at)
        .bind(backup_id)
        .execute(pool)
        .await?;

        Ok(VerifyBackupResult {
            id: backup_id.to_string(),
            status: status.to_string(),
            verified_at,
            calculated_checksum,
            stored_checksum,
            is_valid,
        })
    }

    pub async fn list_backups(pool: &DbPool) -> Result<Vec<BackupRecord>, AppError> {
        let records = sqlx::query_as(
            "SELECT id, target_path, started_at, completed_at, status, checksum, size_bytes, verified_at, error_message
             FROM backup_records
             ORDER BY started_at DESC"
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}

fn calculate_checksum_and_size(path: &Path) -> Result<(String, u64), std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    let mut total_bytes = 0u64;

    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        total_bytes += count as u64;
    }

    let checksum = hex::encode(hasher.finalize());
    Ok((checksum, total_bytes))
}
