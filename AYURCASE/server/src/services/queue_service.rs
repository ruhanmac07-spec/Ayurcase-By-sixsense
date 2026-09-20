use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::queue::DoctorQueueItem;
use crate::repositories::DbPool;
use chrono::{DateTime, Utc};

pub struct QueueService;

impl QueueService {
    pub async fn get_doctor_queue(
        pool: &DbPool,
        doctor_id: &str,
        workspace_id: &str,
    ) -> Result<Vec<DoctorQueueItem>, AppError> {
        let rows: Vec<(String, String, String, String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, String, i64, String)> = sqlx::query_as(
            "SELECT q.id, q.visit_id, v.visit_number, p.id, p.full_name, p.patient_code, p.phone, p.sex, p.date_of_birth, v.purpose, q.status, q.priority, q.queued_at
             FROM queue_entries q
             JOIN visits v ON v.id = q.visit_id
             JOIN patients p ON p.id = v.patient_id
             WHERE q.doctor_id = ? AND q.workspace_id = ? AND q.status IN ('WAITING', 'CALLED', 'IN_CONSULTATION')
             ORDER BY q.priority DESC, q.queued_at ASC"
        )
        .bind(doctor_id)
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;

        let now = Utc::now();
        let items = rows
            .into_iter()
            .map(|(q_id, v_id, v_num, p_id, p_name, p_code, p_phone, p_sex, p_dob, purpose, status, priority, queued_at)| {
                let waiting_mins = DateTime::parse_from_rfc3339(&queued_at)
                    .map(|t| (now - t.with_timezone(&Utc)).num_minutes())
                    .unwrap_or(0)
                    .max(0);

                DoctorQueueItem {
                    queue_id: q_id,
                    visit_id: v_id,
                    visit_number: v_num,
                    patient_id: p_id,
                    patient_name: p_name,
                    patient_code: p_code,
                    patient_phone: p_phone,
                    patient_sex: p_sex,
                    patient_dob: p_dob,
                    purpose,
                    status,
                    priority,
                    queued_at,
                    waiting_duration_mins: waiting_mins,
                }
            })
            .collect();

        Ok(items)
    }

    pub async fn get_intake_snapshot(
        pool: &DbPool,
        workspace_id: &str,
    ) -> Result<Vec<DoctorQueueItem>, AppError> {
        let rows: Vec<(String, String, String, String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, String, i64, String)> = sqlx::query_as(
            "SELECT q.id, q.visit_id, v.visit_number, p.id, p.full_name, p.patient_code, p.phone, p.sex, p.date_of_birth, v.purpose, q.status, q.priority, q.queued_at
             FROM queue_entries q
             JOIN visits v ON v.id = q.visit_id
             JOIN patients p ON p.id = v.patient_id
             WHERE q.workspace_id = ? AND q.status IN ('WAITING', 'CALLED', 'IN_CONSULTATION')
             ORDER BY q.queued_at DESC
             LIMIT 50"
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;

        let now = Utc::now();
        let items = rows
            .into_iter()
            .map(|(q_id, v_id, v_num, p_id, p_name, p_code, p_phone, p_sex, p_dob, purpose, status, priority, queued_at)| {
                let waiting_mins = DateTime::parse_from_rfc3339(&queued_at)
                    .map(|t| (now - t.with_timezone(&Utc)).num_minutes())
                    .unwrap_or(0)
                    .max(0);

                DoctorQueueItem {
                    queue_id: q_id,
                    visit_id: v_id,
                    visit_number: v_num,
                    patient_id: p_id,
                    patient_name: p_name,
                    patient_code: p_code,
                    patient_phone: p_phone,
                    patient_sex: p_sex,
                    patient_dob: p_dob,
                    purpose,
                    status,
                    priority,
                    queued_at,
                    waiting_duration_mins: waiting_mins,
                }
            })
            .collect();

        Ok(items)
    }

    pub async fn call_patient(
        pool: &DbPool,
        queue_id: &str,
        doctor_id: &str,
    ) -> Result<(), AppError> {
        let now_str = Utc::now().to_rfc3339();
        let res = sqlx::query(
            "UPDATE queue_entries 
             SET status = 'CALLED', called_at = ? 
             WHERE id = ? AND doctor_id = ?"
        )
        .bind(&now_str)
        .bind(queue_id)
        .bind(doctor_id)
        .execute(pool)
        .await?;

        if res.rows_affected() == 0 {
            return Err(AppError::NotFound("Queue entry not found or not assigned to you".to_string()));
        }

        Ok(())
    }

    pub async fn start_consultation(
        pool: &DbPool,
        visit_id: &str,
        doctor_id: &str,
    ) -> Result<(), AppError> {
        let vis: Option<(String, String)> = sqlx::query_as(
            "SELECT status, doctor_id FROM visits WHERE id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let (status, assigned_doc) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if status == "FINALIZED" || status == "CANCELLED" {
            return Err(AppError::Forbidden(format!(
                "Cannot start consultation: clinical encounter is {} and sealed",
                status
            )));
        }

        if assigned_doc != doctor_id {
            return Err(AppError::Forbidden(
                "Access denied: this visit is assigned to another clinician".to_string(),
            ));
        }

        let now_str = Utc::now().to_rfc3339();

        let mut tx = pool.begin().await?;

        sqlx::query(
            "UPDATE queue_entries 
             SET status = 'IN_CONSULTATION' 
             WHERE visit_id = ? AND doctor_id = ?"
        )
        .bind(visit_id)
        .bind(doctor_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE visits 
             SET status = 'IN_CONSULTATION', updated_at = ?
             WHERE id = ? AND doctor_id = ?"
        )
        .bind(&now_str)
        .bind(visit_id)
        .bind(doctor_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn transfer_patient(
        pool: &DbPool,
        visit_id: &str,
        target_doctor_id: &str,
        actor_id: &str,
    ) -> Result<(), AppError> {
        let vis: Option<(String, String)> = sqlx::query_as(
            "SELECT status, workspace_id FROM visits WHERE id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let (status, _old_ws) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if status == "FINALIZED" || status == "CANCELLED" {
            return Err(AppError::Forbidden(format!(
                "Cannot transfer patient: visit is already {}",
                status
            )));
        }

        // Validate target doctor
        let doc: Option<(String, String)> = sqlx::query_as(
            "SELECT full_name, workspace_id FROM users WHERE id = ? AND role = 'DOCTOR' AND status = 'ACTIVE'"
        )
        .bind(target_doctor_id)
        .fetch_optional(pool)
        .await?;

        let (target_name, target_ws_id) = match doc {
            Some(d) => d,
            None => return Err(AppError::BadRequest("Target doctor is not active".to_string())),
        };

        let now_str = Utc::now().to_rfc3339();
        let mut tx = pool.begin().await?;

        // Update queue entry doctor AND workspace_id
        sqlx::query(
            "UPDATE queue_entries 
             SET doctor_id = ?, workspace_id = ?, status = 'WAITING', transferred_at = ?
             WHERE visit_id = ?"
        )
        .bind(target_doctor_id)
        .bind(&target_ws_id)
        .bind(&now_str)
        .bind(visit_id)
        .execute(&mut *tx)
        .await?;

        // Update visit doctor AND workspace_id
        sqlx::query(
            "UPDATE visits 
             SET doctor_id = ?, workspace_id = ?, status = 'QUEUED', updated_by = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(target_doctor_id)
        .bind(&target_ws_id)
        .bind(actor_id)
        .bind(&now_str)
        .bind(visit_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        let _ = AuditService::log_event(
            pool,
            Some(&target_ws_id),
            Some(actor_id),
            "TRANSFER_PATIENT",
            Some("VISIT"),
            Some(visit_id),
            None,
            serde_json::json!({
                "target_doctor_id": target_doctor_id,
                "target_doctor_name": target_name,
                "target_workspace_id": target_ws_id,
            }),
        )
        .await;

        Ok(())
    }
}
