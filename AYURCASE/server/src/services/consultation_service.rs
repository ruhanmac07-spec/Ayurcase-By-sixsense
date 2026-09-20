use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::diagnosis::{AttachDiagnosisRequest, VisitDiagnosisDetail};
use crate::repositories::DbPool;
use chrono::Utc;
use uuid::Uuid;

pub struct ConsultationService;

impl ConsultationService {
    pub async fn save_clinical_notes(
        pool: &DbPool,
        visit_id: &str,
        chief_complaint: Option<String>,
        history_text: Option<String>,
        past_history: Option<String>,
        family_history: Option<String>,
        personal_history: Option<String>,
        ayush_data_json: Option<String>,
        schema_version: Option<String>,
        doctor_id: &str,
        complaints_list: Option<Vec<crate::models::visit::VisitComplaintItem>>,
    ) -> Result<(), AppError> {
        let vis: Option<(String,)> = sqlx::query_as("SELECT status FROM visits WHERE id = ?")
            .bind(visit_id)
            .fetch_optional(pool)
            .await?;

        let (status,) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if status == "FINALIZED" || status == "CANCELLED" {
            return Err(AppError::Forbidden(format!(
                "Clinical encounter is {} and sealed against modification",
                status
            )));
        }

        let now_str = Utc::now().to_rfc3339();
        let mut final_chief_complaint = chief_complaint.clone();

        // Begin transaction to enforce atomic clinical persistence
        let mut tx = pool.begin().await?;

        // 1. If repeatable complaints are provided, validate and replace visit_complaints rows
        if let Some(ref items) = complaints_list {
            let allowed_units = ["Hours", "Days", "Weeks", "Months", "Years"];

            // First validate that every non-empty complaint has a valid duration
            for item in items {
                let c_clean = item.complaint_text.trim();
                if !c_clean.is_empty() {
                    match item.duration_value {
                        Some(val) if val > 0 => {}
                        _ => {
                            return Err(AppError::BadRequest(format!(
                                "Chief complaint '{}' requires an independent positive duration value",
                                c_clean
                            )));
                        }
                    }
                    if let Some(ref unit) = item.duration_unit {
                        if !allowed_units.contains(&unit.as_str()) {
                            return Err(AppError::BadRequest(format!(
                                "Duration unit '{}' for complaint '{}' is invalid. Allowed: Hours, Days, Weeks, Months, Years",
                                unit, c_clean
                            )));
                        }
                    } else {
                        return Err(AppError::BadRequest(format!(
                            "Chief complaint '{}' requires a duration unit (Hours, Days, Weeks, Months, Years)",
                            c_clean
                        )));
                    }
                }
            }

            sqlx::query("DELETE FROM visit_complaints WHERE visit_id = ?")
                .bind(visit_id)
                .execute(&mut *tx)
                .await?;

            let mut summary_lines = Vec::new();
            let mut valid_idx = 0;
            for item in items {
                let c_clean = item.complaint_text.trim();
                if c_clean.is_empty() {
                    continue;
                }
                let vcmp_id = format!("vcmp_{}", Uuid::now_v7());
                let dur_unit = item.duration_unit.as_deref().unwrap_or("Days");
                sqlx::query(
                    "INSERT INTO visit_complaints (id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&vcmp_id)
                .bind(visit_id)
                .bind(c_clean)
                .bind(item.duration_value)
                .bind(dur_unit)
                .bind(&item.notes)
                .bind(valid_idx as i64)
                .bind(&now_str)
                .execute(&mut *tx)
                .await?;

                valid_idx += 1;
                let dur_suffix = match item.duration_value {
                    Some(val) => format!(" — {} {}", val, dur_unit),
                    None => String::new(),
                };
                summary_lines.push(format!("{}. {}{}", summary_lines.len() + 1, c_clean, dur_suffix));
            }

            if !summary_lines.is_empty() {
                final_chief_complaint = Some(summary_lines.join("; "));
            }
        }

        // 2. Complaints history upsert (preserving backward compatibility)
        let comp_exists: Option<(String,)> = sqlx::query_as("SELECT id FROM complaints_history WHERE visit_id = ?")
            .bind(visit_id)
            .fetch_optional(&mut *tx)
            .await?;

        if let Some((comp_id,)) = comp_exists {
            sqlx::query(
                "UPDATE complaints_history 
                 SET chief_complaint = ?, history_text = ?, past_history = ?, family_history = ?, personal_history = ?, updated_at = ?
                 WHERE id = ?"
            )
            .bind(&final_chief_complaint)
            .bind(&history_text)
            .bind(&past_history)
            .bind(&family_history)
            .bind(&personal_history)
            .bind(&now_str)
            .bind(&comp_id)
            .execute(&mut *tx)
            .await?;
        } else {
            let new_comp_id = format!("cmp_{}", Uuid::now_v7());
            sqlx::query(
                "INSERT INTO complaints_history (id, visit_id, chief_complaint, history_text, past_history, family_history, personal_history, recorded_by, recorded_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&new_comp_id)
            .bind(visit_id)
            .bind(&final_chief_complaint)
            .bind(&history_text)
            .bind(&past_history)
            .bind(&family_history)
            .bind(&personal_history)
            .bind(doctor_id)
            .bind(&now_str)
            .bind(&now_str)
            .execute(&mut *tx)
            .await?;
        }

        // 3. AYUSH Case-Taking upsert
        if let Some(data_json) = ayush_data_json {
            let ayush_exists: Option<(String,)> = sqlx::query_as("SELECT id FROM ayush_case_taking WHERE visit_id = ?")
                .bind(visit_id)
                .fetch_optional(&mut *tx)
                .await?;

            if let Some((ayush_id,)) = ayush_exists {
                sqlx::query(
                    "UPDATE ayush_case_taking 
                     SET data_json = ?, schema_version = ?, updated_at = ?
                     WHERE id = ?"
                )
                .bind(&data_json)
                .bind(&schema_version)
                .bind(&now_str)
                .bind(&ayush_id)
                .execute(&mut *tx)
                .await?;
            } else {
                let new_ayush_id = format!("ayu_{}", Uuid::now_v7());
                sqlx::query(
                    "INSERT INTO ayush_case_taking (id, visit_id, data_json, schema_version, recorded_by, recorded_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&new_ayush_id)
                .bind(visit_id)
                .bind(&data_json)
                .bind(&schema_version)
                .bind(doctor_id)
                .bind(&now_str)
                .bind(&now_str)
                .execute(&mut *tx)
                .await?;
            }
        }

        // 4. Update visit timestamp
        sqlx::query("UPDATE visits SET updated_by = ?, updated_at = ? WHERE id = ?")
            .bind(doctor_id)
            .bind(&now_str)
            .bind(visit_id)
            .execute(&mut *tx)
            .await?;

        // Commit transaction
        tx.commit().await?;

        Ok(())
    }

    pub async fn attach_diagnosis(
        pool: &DbPool,
        visit_id: &str,
        req: AttachDiagnosisRequest,
        doctor_id: &str,
    ) -> Result<VisitDiagnosisDetail, AppError> {
        let vis: Option<(String,)> = sqlx::query_as("SELECT status FROM visits WHERE id = ?")
            .bind(visit_id)
            .fetch_optional(pool)
            .await?;

        let (status,) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if status == "FINALIZED" || status == "CANCELLED" {
            return Err(AppError::Forbidden(format!(
                "Clinical encounter is {} and sealed against modification",
                status
            )));
        }

        let diag: Option<(String, String)> = sqlx::query_as("SELECT code, name FROM diagnosis_catalog WHERE id = ?")
            .bind(&req.diagnosis_id)
            .fetch_optional(pool)
            .await?;

        let (code, name) = match diag {
            Some(d) => d,
            None => return Err(AppError::NotFound("Diagnosis catalogue entry not found".to_string())),
        };

        let id = format!("vd_{}", Uuid::now_v7());
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO visit_diagnoses (id, visit_id, diagnosis_id, diagnosis_text, selected_by, selected_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(visit_id, diagnosis_id) DO UPDATE SET diagnosis_text = excluded.diagnosis_text"
        )
        .bind(&id)
        .bind(visit_id)
        .bind(&req.diagnosis_id)
        .bind(&req.diagnosis_text)
        .bind(doctor_id)
        .bind(&now_str)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            None,
            Some(doctor_id),
            "ATTACH_DIAGNOSIS",
            Some("VISIT"),
            Some(visit_id),
            None,
            serde_json::json!({ "diagnosis_code": code, "diagnosis_name": name }),
        )
        .await;

        Ok(VisitDiagnosisDetail {
            id,
            diagnosis_id: req.diagnosis_id,
            code,
            name,
            diagnosis_text: req.diagnosis_text,
            selected_at: now_str,
        })
    }

    pub async fn remove_diagnosis(
        pool: &DbPool,
        visit_id: &str,
        diagnosis_id: &str,
        doctor_id: &str,
    ) -> Result<(), AppError> {
        let vis: Option<(String,)> = sqlx::query_as("SELECT status FROM visits WHERE id = ?")
            .bind(visit_id)
            .fetch_optional(pool)
            .await?;

        let (status,) = match vis {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        if status == "FINALIZED" || status == "CANCELLED" {
            return Err(AppError::Forbidden(format!(
                "Clinical encounter is {} and sealed against modification",
                status
            )));
        }

        sqlx::query("DELETE FROM visit_diagnoses WHERE visit_id = ? AND diagnosis_id = ?")
            .bind(visit_id)
            .bind(diagnosis_id)
            .execute(pool)
            .await?;

        let _ = AuditService::log_event(
            pool,
            None,
            Some(doctor_id),
            "REMOVE_DIAGNOSIS",
            Some("VISIT"),
            Some(visit_id),
            None,
            serde_json::json!({ "diagnosis_id": diagnosis_id }),
        )
        .await;

        Ok(())
    }

    pub async fn get_diagnoses(
        pool: &DbPool,
        visit_id: &str,
    ) -> Result<Vec<VisitDiagnosisDetail>, AppError> {
        let rows: Vec<(String, String, String, String, Option<String>, String)> = sqlx::query_as(
            "SELECT vd.id, vd.diagnosis_id, d.code, d.name, vd.diagnosis_text, vd.selected_at
             FROM visit_diagnoses vd
             JOIN diagnosis_catalog d ON d.id = vd.diagnosis_id
             WHERE vd.visit_id = ?
             ORDER BY vd.selected_at ASC"
        )
        .bind(visit_id)
        .fetch_all(pool)
        .await?;

        let details = rows
            .into_iter()
            .map(|(id, diag_id, code, name, text, selected_at)| {
                VisitDiagnosisDetail {
                    id,
                    diagnosis_id: diag_id,
                    code,
                    name,
                    diagnosis_text: text,
                    selected_at,
                }
            })
            .collect();

        Ok(details)
    }
}
