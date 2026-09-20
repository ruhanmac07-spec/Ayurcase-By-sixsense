use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::queue::QueueEntry;
use crate::models::visit::{
    AyushCaseTaking, ComplaintsHistory, Consent, CreateVisitIntakeRequest, Visit, VisitDetailResponse, Vitals,
};
use crate::repositories::DbPool;
use chrono::Utc;
use uuid::Uuid;

pub struct VisitService;

impl VisitService {
    pub async fn create_intake(
        pool: &DbPool,
        workspace_id: &str,
        req: CreateVisitIntakeRequest,
        actor_id: &str,
    ) -> Result<VisitDetailResponse, AppError> {
        // 1. Validate Patient
        let patient_exists: Option<(String, String)> = sqlx::query_as(
            "SELECT full_name, patient_code FROM patients WHERE id = ? AND workspace_id = ?"
        )
        .bind(&req.patient_id)
        .bind(workspace_id)
        .fetch_optional(pool)
        .await?;

        let (_patient_name, patient_code) = match patient_exists {
            Some(res) => res,
            None => return Err(AppError::NotFound("Patient not found in this workspace".to_string())),
        };

        // 2. Validate Doctor
        let doc_exists: Option<(String,)> = sqlx::query_as(
            "SELECT full_name FROM users WHERE id = ? AND role = 'DOCTOR' AND status = 'ACTIVE' AND workspace_id = ?"
        )
        .bind(&req.doctor_id)
        .bind(workspace_id)
        .fetch_optional(pool)
        .await?;

        let (doctor_name,) = match doc_exists {
            Some(res) => res,
            None => return Err(AppError::BadRequest("Selected doctor is not active or not in this workspace".to_string())),
        };

        let mut attempts = 0;
        let (visit_id, visit_number, opd_number, patient_visit_seq, _now_str) = loop {
            attempts += 1;

            let candidate_now = Utc::now().to_rfc3339();

            // 3a. Compute per-patient visit sequence number (inside transaction for safety)
            // We count existing visits for this patient and add 1.
            let existing_seq: (i64,) = sqlx::query_as(
                "SELECT COALESCE(MAX(patient_visit_seq), 0) FROM visits WHERE patient_id = ?"
            )
            .bind(&req.patient_id)
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
            // existing_seq is always (0+) because COALESCE gives 0 if no rows
            let max_patient_seq: i64 = existing_seq.0;
            let candidate_patient_seq = max_patient_seq + 1;

            // Human-readable visit number: zero-padded per-patient sequence, e.g. "01"
            let candidate_num = format!("{:02}", candidate_patient_seq);

            // 3b. Build OPD number: PATIENT_CODE/DD/MM/YYYY from visit date
            // Use the current date (today) since visit_date = now
            let visit_date_for_opd = &candidate_now;
            let date_part = visit_date_for_opd.split(['T', ' ']).next().unwrap_or(visit_date_for_opd);
            let date_comps: Vec<&str> = date_part.split('-').collect();
            let opd_date_str = if date_comps.len() == 3 {
                format!("{}/{}/{}", date_comps[2], date_comps[1], date_comps[0])
            } else {
                date_part.to_string()
            };
            let mut candidate_opd = format!("{}/{}", patient_code, opd_date_str);

            // Collision-safe: if the same patient already has an OPD with this date today, append -2, -3 ...
            let mut opd_suffix = 1u32;
            loop {
                let conflict: (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM visits WHERE patient_id = ? AND opd_number = ?"
                )
                .bind(&req.patient_id)
                .bind(&candidate_opd)
                .fetch_one(pool)
                .await
                .unwrap_or((0,));
                let count = conflict.0;
                if count == 0 {
                    break;
                }
                opd_suffix += 1;
                candidate_opd = format!("{}/{}-{}", patient_code, opd_date_str, opd_suffix);
            }

            let candidate_id = format!("vis_{}", Uuid::now_v7());

            // 3. Begin Transaction
            let mut tx = match pool.begin().await {
                Ok(t) => t,
                Err(e) => return Err(AppError::Database(e)),
            };

            // 4. Insert Visit (includes opd_number and patient_visit_seq)
            let insert_res = sqlx::query(
                "INSERT INTO visits (id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, opd_number, patient_visit_seq)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?)"
            )
            .bind(&candidate_id)
            .bind(workspace_id)
            .bind(&req.patient_id)
            .bind(&req.doctor_id)
            .bind(&candidate_num)
            .bind(&candidate_now)
            .bind(&req.purpose)
            .bind(actor_id)
            .bind(actor_id)
            .bind(&candidate_now)
            .bind(&candidate_now)
            .bind(&candidate_opd)
            .bind(candidate_patient_seq)
            .execute(&mut *tx)
            .await;

            if let Err(e) = insert_res {
                let is_unique = match &e {
                    sqlx::Error::Database(d) => d.is_unique_violation() || d.message().to_lowercase().contains("unique"),
                    _ => false,
                };
                if is_unique && attempts < 5 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(10 * attempts as u64)).await;
                    continue;
                }
                return Err(AppError::Database(e));
            }

            // 5. Insert Consent
            let consent_id = format!("cst_{}", Uuid::now_v7());
            let consent_status = req.consent_status.clone().unwrap_or_else(|| "GIVEN".to_string());
            sqlx::query(
                "INSERT INTO consents (id, visit_id, consent_status, consent_text_version, captured_by, captured_at)
                 VALUES (?, ?, ?, ?, ?, ?)"
            )
            .bind(&consent_id)
            .bind(&candidate_id)
            .bind(&consent_status)
            .bind(&req.consent_version)
            .bind(actor_id)
            .bind(&candidate_now)
            .execute(&mut *tx)
            .await?;

            // 6. Insert Vitals
            let vitals_id = format!("vit_{}", Uuid::now_v7());
            sqlx::query(
                "INSERT INTO vitals (id, visit_id, temperature, pulse_rate, respiratory_rate, systolic_bp, diastolic_bp, oxygen_saturation, height_cm, weight_kg, notes, recorded_by, recorded_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&vitals_id)
            .bind(&candidate_id)
            .bind(req.temperature)
            .bind(req.pulse_rate)
            .bind(req.respiratory_rate)
            .bind(req.systolic_bp)
            .bind(req.diastolic_bp)
            .bind(req.oxygen_saturation)
            .bind(req.height_cm)
            .bind(req.weight_kg)
            .bind(&req.vitals_notes)
            .bind(actor_id)
            .bind(&candidate_now)
            .execute(&mut *tx)
            .await?;

            // 7. Insert Queue Entry
            let queue_id = format!("que_{}", Uuid::now_v7());
            let priority = req.priority.unwrap_or(0);
            sqlx::query(
                "INSERT INTO queue_entries (id, visit_id, workspace_id, doctor_id, status, priority, queued_at, created_by)
                 VALUES (?, ?, ?, ?, 'WAITING', ?, ?, ?)"
            )
            .bind(&queue_id)
            .bind(&candidate_id)
            .bind(workspace_id)
            .bind(&req.doctor_id)
            .bind(priority)
            .bind(&candidate_now)
            .bind(actor_id)
            .execute(&mut *tx)
            .await?;

            // 8. Insert Repeatable Chief Complaints if provided at intake
            if let Some(ref complaints) = req.complaints_list {
                let mut summary_lines = Vec::new();
                for (idx, item) in complaints.iter().enumerate() {
                    let c_clean = item.complaint_text.trim();
                    if c_clean.is_empty() {
                        continue;
                    }
                    let vcmp_id = format!("vcmp_{}", Uuid::now_v7());
                    sqlx::query(
                        "INSERT INTO visit_complaints (id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&vcmp_id)
                    .bind(&candidate_id)
                    .bind(c_clean)
                    .bind(item.duration_value)
                    .bind(&item.duration_unit)
                    .bind(&item.notes)
                    .bind(idx as i64)
                    .bind(&candidate_now)
                    .execute(&mut *tx)
                    .await?;

                    let dur_suffix = match (item.duration_value, &item.duration_unit) {
                        (Some(val), Some(unit)) => format!(" — {} {}", val, unit),
                        (Some(val), None) => format!(" — {}", val),
                        _ => String::new(),
                    };
                    summary_lines.push(format!("{}. {}{}", summary_lines.len() + 1, c_clean, dur_suffix));
                }

                if !summary_lines.is_empty() {
                    let summary_text = summary_lines.join("; ");
                    let cmp_id = format!("cmp_{}", Uuid::now_v7());
                    sqlx::query(
                        "INSERT INTO complaints_history (id, visit_id, chief_complaint, recorded_by, recorded_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&cmp_id)
                    .bind(&candidate_id)
                    .bind(&summary_text)
                    .bind(actor_id)
                    .bind(&candidate_now)
                    .bind(&candidate_now)
                    .execute(&mut *tx)
                    .await?;
                }
            }

            // 9. Insert AYUSH Case Taking if provided at intake
            if let Some(ref ayush_json) = req.ayush_data_json {
                let ayush_id = format!("ay_{}", Uuid::now_v7());
                sqlx::query(
                    "INSERT INTO ayush_case_taking (id, visit_id, data_json, schema_version, recorded_by, recorded_at, updated_at)
                     VALUES (?, ?, ?, 'v1.0-intake', ?, ?, ?)"
                )
                .bind(&ayush_id)
                .bind(&candidate_id)
                .bind(ayush_json)
                .bind(actor_id)
                .bind(&candidate_now)
                .bind(&candidate_now)
                .execute(&mut *tx)
                .await?;
            }

            // Commit Transaction
            tx.commit().await?;

            break (candidate_id, candidate_num, candidate_opd, candidate_patient_seq, candidate_now);
        };

        // Ensure patient folder exists under treating doctor: Patient Data/<Department>/<Doctor>/<Patient Code>/
        let ws_name: String = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
            .bind(workspace_id)
            .fetch_optional(pool)
            .await?
            .map(|r| r.0)
            .unwrap_or_else(|| "General".to_string());
        let _ = crate::services::storage_service::PatientStorageService::ensure_patient_folder(
            &ws_name,
            &doctor_name,
            &patient_code,
        );

        // Audit Event
        let _ = AuditService::log_event(
            pool,
            Some(workspace_id),
            Some(actor_id),
            "CREATE_VISIT_INTAKE",
            Some("VISIT"),
            Some(&visit_id),
            None,
            serde_json::json!({
                "visit_number": visit_number,
                "opd_number": opd_number,
                "patient_visit_seq": patient_visit_seq,
                "patient_id": req.patient_id,
                "doctor_id": req.doctor_id,
            }),
        )
        .await;

        Self::get_detail(pool, &visit_id).await
    }

    pub async fn get_visit(pool: &DbPool, visit_id: &str) -> Result<Visit, AppError> {
        let visit: Option<Visit> = sqlx::query_as(
            "SELECT id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
             FROM visits WHERE id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        visit.ok_or_else(|| AppError::NotFound(format!("Visit '{}' not found", visit_id)))
    }

    pub async fn get_detail(pool: &DbPool, visit_id: &str) -> Result<VisitDetailResponse, AppError> {
        let visit: Option<Visit> = sqlx::query_as(
            "SELECT id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
             FROM visits WHERE id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let vis = visit.ok_or_else(|| AppError::NotFound(format!("Visit '{}' not found", visit_id)))?;

        let patient: (String, String) = sqlx::query_as(
            "SELECT full_name, patient_code FROM patients WHERE id = ?"
        )
        .bind(&vis.patient_id)
        .fetch_one(pool)
        .await?;

        let doctor: (String,) = sqlx::query_as(
            "SELECT full_name FROM users WHERE id = ?"
        )
        .bind(&vis.doctor_id)
        .fetch_one(pool)
        .await?;

        let consent: Option<Consent> = sqlx::query_as(
            "SELECT id, visit_id, consent_status, consent_text_version, captured_by, captured_at
             FROM consents WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let vitals: Option<Vitals> = sqlx::query_as(
            "SELECT id, visit_id, temperature, pulse_rate, respiratory_rate, systolic_bp, diastolic_bp, oxygen_saturation, height_cm, weight_kg, notes, recorded_by, recorded_at
             FROM vitals WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let complaints: Option<ComplaintsHistory> = sqlx::query_as(
            "SELECT id, visit_id, chief_complaint, history_text, past_history, family_history, personal_history, recorded_by, recorded_at, updated_at
             FROM complaints_history WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let ayush: Option<AyushCaseTaking> = sqlx::query_as(
            "SELECT id, visit_id, data_json, schema_version, recorded_by, recorded_at, updated_at
             FROM ayush_case_taking WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let queue_entry: Option<QueueEntry> = sqlx::query_as(
            "SELECT id, visit_id, workspace_id, doctor_id, status, priority, queued_at, called_at, completed_at, transferred_at, created_by
             FROM queue_entries WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let complaints_list: Vec<crate::models::visit::VisitComplaint> = sqlx::query_as(
            "SELECT id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at
             FROM visit_complaints WHERE visit_id = ?
             ORDER BY sort_order ASC, created_at ASC"
        )
        .bind(visit_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        Ok(VisitDetailResponse {
            visit: vis,
            patient_name: patient.0,
            patient_code: patient.1,
            doctor_name: doctor.0,
            consent,
            vitals,
            complaints,
            complaints_list,
            ayush_case: ayush,
            queue_entry,
        })
    }

    pub async fn get_patient_history(
        pool: &DbPool,
        patient_id: &str,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let visits: Vec<Visit> = sqlx::query_as(
            "SELECT id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
             FROM visits
             WHERE patient_id = ?
             ORDER BY patient_visit_seq ASC, visit_date ASC, created_at ASC"
        )
        .bind(patient_id)
        .fetch_all(pool)
        .await?;

        let mut results = Vec::new();

        for vis in visits {
            let doc_name: (String,) = sqlx::query_as("SELECT full_name FROM users WHERE id = ?")
                .bind(&vis.doctor_id)
                .fetch_optional(pool)
                .await?
                .unwrap_or_else(|| ("Treating Physician".to_string(),));

            let vitals: Option<Vitals> = sqlx::query_as(
                "SELECT id, visit_id, temperature, pulse_rate, respiratory_rate, systolic_bp, diastolic_bp, oxygen_saturation, height_cm, weight_kg, notes, recorded_by, recorded_at
                 FROM vitals WHERE visit_id = ?"
            )
            .bind(&vis.id)
            .fetch_optional(pool)
            .await?;

            let complaints: Option<ComplaintsHistory> = sqlx::query_as(
                "SELECT id, visit_id, chief_complaint, history_text, past_history, family_history, personal_history, recorded_by, recorded_at, updated_at
                 FROM complaints_history WHERE visit_id = ?"
            )
            .bind(&vis.id)
            .fetch_optional(pool)
            .await?;

            let complaints_list: Vec<crate::models::visit::VisitComplaint> = sqlx::query_as(
                "SELECT id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at
                 FROM visit_complaints WHERE visit_id = ?
                 ORDER BY sort_order ASC, created_at ASC"
            )
            .bind(&vis.id)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let ayush: Option<AyushCaseTaking> = sqlx::query_as(
                "SELECT id, visit_id, data_json, schema_version, recorded_by, recorded_at, updated_at
                 FROM ayush_case_taking WHERE visit_id = ?"
            )
            .bind(&vis.id)
            .fetch_optional(pool)
            .await?;

            let diagnoses = crate::services::ConsultationService::get_diagnoses(pool, &vis.id).await?;

            let prescription = crate::services::PrescriptionService::get_detail(pool, &vis.id).await?;

            let documents: Vec<crate::models::document::Document> = sqlx::query_as(
                "SELECT id, visit_id, document_type, file_path, file_hash, generated_by, generated_at
                 FROM documents WHERE visit_id = ?
                 ORDER BY generated_at DESC"
            )
            .bind(&vis.id)
            .fetch_all(pool)
            .await?;

            let first_doc_id = documents.first().map(|d| d.id.clone());

            results.push(serde_json::json!({
                "id": vis.id,
                "visit_number": vis.visit_number,
                "opd_number": vis.opd_number,
                "patient_visit_seq": vis.patient_visit_seq,
                "visit_date": vis.visit_date,
                "purpose": vis.purpose,
                "status": vis.status,
                "doctor_name": doc_name.0,
                "has_document": !documents.is_empty(),
                "document_id": first_doc_id,
                "visit": vis,
                "vitals": vitals,
                "complaints": complaints,
                "complaints_list": complaints_list,
                "ayush_case": ayush,
                "diagnoses": diagnoses,
                "prescription": prescription,
                "documents": documents,
            }));
        }

        Ok(results)
    }
}
