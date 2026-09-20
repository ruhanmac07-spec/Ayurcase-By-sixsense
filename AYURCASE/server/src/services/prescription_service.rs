use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::prescription::{
    Prescription, PrescriptionDetail, PrescriptionItem, SavePrescriptionDraftRequest,
};
use crate::repositories::DbPool;
use chrono::Utc;
use uuid::Uuid;

pub struct PrescriptionService;

impl PrescriptionService {
    pub async fn get_detail(
        pool: &DbPool,
        visit_id: &str,
    ) -> Result<Option<PrescriptionDetail>, AppError> {
        let rx: Option<Prescription> = sqlx::query_as(
            "SELECT id, visit_id, status, source_rule_id, source_rule_version, created_by, finalized_by, created_at, updated_at, finalized_at
             FROM prescriptions WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let prescription = match rx {
            Some(p) => p,
            None => return Ok(None),
        };

        let items: Vec<PrescriptionItem> = sqlx::query_as(
            "SELECT id, prescription_id, medicine_id, medicine_name_snapshot, dosage_text, frequency_text, duration_text, anupana_text, pathya_text, apathya_text, source_type, rule_id, rule_version, created_at
             FROM prescription_items WHERE prescription_id = ?
             ORDER BY created_at ASC"
        )
        .bind(&prescription.id)
        .fetch_all(pool)
        .await?;

        Ok(Some(PrescriptionDetail {
            prescription,
            items,
        }))
    }

    pub async fn save_draft(
        pool: &DbPool,
        visit_id: &str,
        req: SavePrescriptionDraftRequest,
        doctor_id: &str,
    ) -> Result<PrescriptionDetail, AppError> {
        let vis: Option<(String,)> = sqlx::query_as("SELECT status FROM visits WHERE id = ?")
            .bind(visit_id)
            .fetch_optional(pool)
            .await?;

        let (vis_status,) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if vis_status == "FINALIZED" || vis_status == "CANCELLED" {
            return Err(AppError::Forbidden(format!(
                "Clinical encounter is {} and sealed against modification",
                vis_status
            )));
        }

        // Check if prescription already exists and whether it's finalized
        let rx_row: Option<(String, String)> = sqlx::query_as(
            "SELECT id, status FROM prescriptions WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        // 1. Sanitize source_rule_id: must exist in clinical_rules, otherwise NULL
        let clean_source_rule_id = match req.source_rule_id {
            Some(ref r) if !r.trim().is_empty() => {
                let trimmed = r.trim();
                let exists: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM clinical_rules WHERE id = ?"
                )
                .bind(trimmed)
                .fetch_optional(pool)
                .await?;
                if exists.is_some() {
                    Some(trimmed.to_string())
                } else {
                    None
                }
            }
            _ => None,
        };
        let clean_source_rule_version = if clean_source_rule_id.is_some() {
            req.source_rule_version
        } else {
            None
        };

        let mut tx = pool.begin().await?;
        let now_str = Utc::now().to_rfc3339();

        let prescription_id = if let Some((existing_id, status)) = rx_row {
            if status == "FINALIZED" {
                return Err(AppError::Forbidden(
                    "Prescription has already been finalized and locked against edits".to_string(),
                ));
            }

            // Update prescription header
            sqlx::query(
                "UPDATE prescriptions 
                 SET source_rule_id = ?, source_rule_version = ?, updated_at = ?
                 WHERE id = ?"
            )
            .bind(&clean_source_rule_id)
            .bind(clean_source_rule_version)
            .bind(&now_str)
            .bind(&existing_id)
            .execute(&mut *tx)
            .await?;

            // Clear existing draft items
            sqlx::query("DELETE FROM prescription_items WHERE prescription_id = ?")
                .bind(&existing_id)
                .execute(&mut *tx)
                .await?;

            existing_id
        } else {
            let new_rx_id = format!("rx_{}", Uuid::now_v7());
            sqlx::query(
                "INSERT INTO prescriptions (id, visit_id, status, source_rule_id, source_rule_version, created_by, created_at, updated_at)
                 VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?)"
            )
            .bind(&new_rx_id)
            .bind(visit_id)
            .bind(&clean_source_rule_id)
            .bind(clean_source_rule_version)
            .bind(doctor_id)
            .bind(&now_str)
            .bind(&now_str)
            .execute(&mut *tx)
            .await?;

            new_rx_id
        };

        // Insert new items with sanitized foreign keys and snapshots
        for item in req.items {
            let item_id = format!("rxi_{}", Uuid::now_v7());

            // Sanitize medicine_id: Must exist in medicines table, otherwise NULL (custom formulation)
            let clean_medicine_id = match item.medicine_id {
                Some(ref m) if !m.trim().is_empty() => {
                    let trimmed = m.trim();
                    let exists: Option<(String,)> = sqlx::query_as(
                        "SELECT id FROM medicines WHERE id = ?"
                    )
                    .bind(trimmed)
                    .fetch_optional(pool)
                    .await?;
                    if exists.is_some() {
                        Some(trimmed.to_string())
                    } else {
                        None // Doctor-specified custom formulation not in catalog
                    }
                }
                _ => None,
            };

            // Sanitize rule_id: Must exist in clinical_rules table, otherwise NULL
            let clean_rule_id = match item.rule_id {
                Some(ref r) if !r.trim().is_empty() => {
                    let trimmed = r.trim();
                    let exists: Option<(String,)> = sqlx::query_as(
                        "SELECT id FROM clinical_rules WHERE id = ?"
                    )
                    .bind(trimmed)
                    .fetch_optional(pool)
                    .await?;
                    if exists.is_some() {
                        Some(trimmed.to_string())
                    } else {
                        None
                    }
                }
                _ => None,
            };

            let clean_rule_version = if clean_rule_id.is_some() {
                item.rule_version
            } else {
                None
            };

            let source_type = if item.source_type == "RULE_SUGGESTION" && clean_rule_id.is_some() {
                "RULE_SUGGESTION"
            } else {
                "DOCTOR_ADDED"
            };

            let med_snapshot = {
                let trimmed = item.medicine_name_snapshot.trim();
                if trimmed.is_empty() {
                    "Prescribed formulation".to_string()
                } else {
                    trimmed.to_string()
                }
            };

            let dosage = item.dosage_text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let frequency = item.frequency_text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let duration = item.duration_text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let anupana = item.anupana_text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let pathya = item.pathya_text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let apathya = item.apathya_text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

            sqlx::query(
                "INSERT INTO prescription_items (id, prescription_id, medicine_id, medicine_name_snapshot, dosage_text, frequency_text, duration_text, anupana_text, pathya_text, apathya_text, source_type, rule_id, rule_version, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&item_id)
            .bind(&prescription_id)
            .bind(&clean_medicine_id)
            .bind(&med_snapshot)
            .bind(&dosage)
            .bind(&frequency)
            .bind(&duration)
            .bind(&anupana)
            .bind(&pathya)
            .bind(&apathya)
            .bind(source_type)
            .bind(&clean_rule_id)
            .bind(clean_rule_version)
            .bind(&now_str)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        Self::get_detail(pool, visit_id)
            .await?
            .ok_or_else(|| AppError::Internal("Failed to load saved prescription draft".to_string()))
    }

    pub async fn finalize_prescription(
        pool: &DbPool,
        visit_id: &str,
        doctor_id: &str,
    ) -> Result<PrescriptionDetail, AppError> {
        let vis: Option<(String,)> = sqlx::query_as("SELECT status FROM visits WHERE id = ?")
            .bind(visit_id)
            .fetch_optional(pool)
            .await?;

        let (vis_status,) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if vis_status == "CANCELLED" {
            return Err(AppError::Forbidden("Cannot finalize a cancelled visit".to_string()));
        }

        let rx: Option<(String, String)> = sqlx::query_as(
            "SELECT id, status FROM prescriptions WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let (rx_id, current_status) = match rx {
            Some(r) => r,
            None => {
                return Err(AppError::BadRequest(
                    "Cannot finalize: no prescription has been drafted for this visit".to_string(),
                ))
            }
        };

        if current_status == "FINALIZED" {
            return Self::get_detail(pool, visit_id)
                .await?
                .ok_or_else(|| AppError::NotFound("Prescription not found".to_string()));
        }

        let now_str = Utc::now().to_rfc3339();
        let mut tx = pool.begin().await?;

        // 1. Mark Prescription FINALIZED
        sqlx::query(
            "UPDATE prescriptions 
             SET status = 'FINALIZED', finalized_by = ?, finalized_at = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(doctor_id)
        .bind(&now_str)
        .bind(&now_str)
        .bind(&rx_id)
        .execute(&mut *tx)
        .await?;

        // 2. Mark Visit FINALIZED
        sqlx::query(
            "UPDATE visits 
             SET status = 'FINALIZED', finalized_at = ?, updated_by = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&now_str)
        .bind(doctor_id)
        .bind(&now_str)
        .bind(visit_id)
        .execute(&mut *tx)
        .await?;

        // 3. Mark Queue Entry COMPLETED
        sqlx::query(
            "UPDATE queue_entries 
             SET status = 'COMPLETED', completed_at = ?
             WHERE visit_id = ?"
        )
        .bind(&now_str)
        .bind(visit_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        let _ = AuditService::log_event(
            pool,
            None,
            Some(doctor_id),
            "FINALIZE_PRESCRIPTION",
            Some("PRESCRIPTION"),
            Some(&rx_id),
            None,
            serde_json::json!({ "visit_id": visit_id }),
        )
        .await;

        Self::get_detail(pool, visit_id)
            .await?
            .ok_or_else(|| AppError::Internal("Failed to load finalized prescription".to_string()))
    }
}
