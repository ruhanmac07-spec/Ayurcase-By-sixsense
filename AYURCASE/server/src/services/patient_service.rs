use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::patient::{CreatePatientRequest, DuplicateCheckResult, Patient, UpdatePatientRequest};
use crate::repositories::DbPool;
use chrono::Utc;
use uuid::Uuid;

pub struct PatientService;

impl PatientService {
    pub async fn search(
        pool: &DbPool,
        workspace_id: &str,
        query: &str,
    ) -> Result<Vec<Patient>, AppError> {
        let pattern = format!("%{}%", query.trim());
        let patients = sqlx::query_as(
            "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
             FROM patients
             WHERE workspace_id = ? AND status = 'ACTIVE' AND (
                 full_name LIKE ? OR phone LIKE ? OR patient_code LIKE ? OR opd_case_id LIKE ?
             )
             ORDER BY created_at DESC
             LIMIT 50"
        )
        .bind(workspace_id)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .fetch_all(pool)
        .await?;

        Ok(patients)
    }

    pub async fn check_duplicates(
        pool: &DbPool,
        workspace_id: &str,
        phone: Option<&str>,
        full_name: &str,
    ) -> Result<DuplicateCheckResult, AppError> {
        let name_pattern = format!("%{}%", full_name.trim());
        let mut duplicates = Vec::new();

        if let Some(ph) = phone {
            if !ph.trim().is_empty() {
                let by_phone: Vec<Patient> = sqlx::query_as(
                    "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
                     FROM patients
                     WHERE workspace_id = ? AND phone = ?"
                )
                .bind(workspace_id)
                .bind(ph.trim())
                .fetch_all(pool)
                .await?;

                duplicates.extend(by_phone);
            }
        }

        if duplicates.is_empty() && !full_name.trim().is_empty() {
            let by_name: Vec<Patient> = sqlx::query_as(
                "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
                 FROM patients
                 WHERE workspace_id = ? AND full_name LIKE ?
                 LIMIT 5"
            )
            .bind(workspace_id)
            .bind(&name_pattern)
            .fetch_all(pool)
            .await?;

            duplicates.extend(by_name);
        }

        // Deduplicate
        duplicates.sort_by(|a, b| a.id.cmp(&b.id));
        duplicates.dedup_by(|a, b| a.id == b.id);

        let has_duplicates = !duplicates.is_empty();
        Ok(DuplicateCheckResult {
            has_potential_duplicates: has_duplicates,
            duplicates,
        })
    }

    pub async fn get(pool: &DbPool, id: &str) -> Result<Patient, AppError> {
        let p: Option<Patient> = sqlx::query_as(
            "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
             FROM patients WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        p.ok_or_else(|| AppError::NotFound(format!("Patient '{}' not found", id)))
    }

    pub async fn generate_next_patient_code(
        pool: &DbPool,
        workspace_id: &str,
    ) -> Result<String, AppError> {
        let codes: Vec<(String,)> = sqlx::query_as("SELECT patient_code FROM patients WHERE workspace_id = ?")
            .bind(workspace_id)
            .fetch_all(pool)
            .await?;

        let mut max_num: i64 = 0;
        for (c,) in &codes {
            if let Ok(num) = c.parse::<i64>() {
                if num > max_num {
                    max_num = num;
                }
            } else if let Some(suffix) = c.split('-').last() {
                if let Ok(num) = suffix.parse::<i64>() {
                    if num > max_num {
                        max_num = num;
                    }
                }
            }
        }

        let next_num = if max_num > 0 {
            max_num + 1
        } else {
            (codes.len() as i64) + 1
        };

        Ok(format!("{:04}", next_num))
    }

    pub async fn create(
        pool: &DbPool,
        workspace_id: &str,
        req: CreatePatientRequest,
        actor_id: &str,
    ) -> Result<Patient, AppError> {
        if req.full_name.trim().is_empty() {
            return Err(AppError::Validation("Patient full name is required".to_string()));
        }

        let patient_code = if let Some(code) = req.patient_code {
            let trimmed = code.trim().to_string();
            if trimmed.is_empty() {
                Self::generate_next_patient_code(pool, workspace_id).await?
            } else {
                trimmed
            }
        } else {
            Self::generate_next_patient_code(pool, workspace_id).await?
        };

        let id = format!("pat_{}", Uuid::now_v7());
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO patients (id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)"
        )
        .bind(&id)
        .bind(workspace_id)
        .bind(&patient_code)
        .bind(&req.opd_case_id)
        .bind(&req.full_name)
        .bind(&req.date_of_birth)
        .bind(&req.sex)
        .bind(&req.phone)
        .bind(&req.address)
        .bind(&req.emergency_contact)
        .bind(&now_str)
        .bind(&now_str)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            Some(workspace_id),
            Some(actor_id),
            "CREATE_PATIENT",
            Some("PATIENT"),
            Some(&id),
            None,
            serde_json::json!({ "patient_code": patient_code, "full_name": req.full_name }),
        )
        .await;

        // AUTOMATIC FOLDER CREATION (Only after successful DB commit)
        // Resolves Department name and Doctor name, then creates Patient Data/<Department>/<Doctor>/<Patient Code>/
        let ws_name: String = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
            .bind(workspace_id)
            .fetch_optional(pool)
            .await?
            .map(|r| r.0)
            .unwrap_or_else(|| "General".to_string());

        let mut doctor_name: Option<String> = None;
        if let Some(ref doc_id) = req.doctor_id {
            let doc_row: Option<(String,)> = sqlx::query_as("SELECT full_name FROM users WHERE id = ?")
                .bind(doc_id)
                .fetch_optional(pool)
                .await?;
            if let Some((d_name,)) = doc_row {
                doctor_name = Some(d_name);
            }
        }

        if doctor_name.is_none() {
            let actor_doc: Option<(String,)> = sqlx::query_as("SELECT full_name FROM users WHERE id = ? AND role = 'DOCTOR'")
                .bind(actor_id)
                .fetch_optional(pool)
                .await?;
            if let Some((a_name,)) = actor_doc {
                doctor_name = Some(a_name);
            }
        }

        if doctor_name.is_none() {
            let ws_doc: Option<(String,)> = sqlx::query_as(
                "SELECT full_name FROM users WHERE workspace_id = ? AND role = 'DOCTOR' AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1"
            )
            .bind(workspace_id)
            .fetch_optional(pool)
            .await?;
            if let Some((w_name,)) = ws_doc {
                doctor_name = Some(w_name);
            }
        }

        let doc_final = doctor_name.unwrap_or_else(|| "General".to_string());
        let _ = crate::services::storage_service::PatientStorageService::ensure_patient_folder(
            &ws_name,
            &doc_final,
            &patient_code,
        );

        Self::get(pool, &id).await
    }

    pub async fn update(
        pool: &DbPool,
        id: &str,
        req: UpdatePatientRequest,
        actor_id: &str,
    ) -> Result<Patient, AppError> {
        let p = Self::get(pool, id).await?;
        let full_name = req.full_name.unwrap_or(p.full_name);
        let dob = req.date_of_birth.or(p.date_of_birth);
        let sex = req.sex.or(p.sex);
        let phone = req.phone.or(p.phone);
        let address = req.address.or(p.address);
        let emergency_contact = req.emergency_contact.or(p.emergency_contact);
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "UPDATE patients 
             SET full_name = ?, date_of_birth = ?, sex = ?, phone = ?, address = ?, emergency_contact = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&full_name)
        .bind(&dob)
        .bind(&sex)
        .bind(&phone)
        .bind(&address)
        .bind(&emergency_contact)
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            Some(&p.workspace_id),
            Some(actor_id),
            "UPDATE_PATIENT",
            Some("PATIENT"),
            Some(id),
            None,
            serde_json::json!({ "full_name": full_name }),
        )
        .await;

        Self::get(pool, id).await
    }
}
