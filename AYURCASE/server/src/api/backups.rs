use axum::{
    extract::{Path, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::audit::AuditService;
use crate::backup::BackupService;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::models::backup::{BackupRecord, VerifyBackupResult};
use crate::repositories::DbPool;

pub async fn list_backups(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<Vec<BackupRecord>>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let records = BackupService::list_backups(&pool).await?;
    Ok(Json(records))
}

pub async fn trigger_backup(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<BackupRecord>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let config = AppConfig::from_env();

    let record = BackupService::trigger_backup(&pool, &config.backups_dir).await?;

    let _ = AuditService::log_event(
        &pool,
        None,
        Some(&user.user_id),
        "TRIGGER_BACKUP",
        Some("BACKUP"),
        Some(&record.id),
        None,
        serde_json::json!({
            "target_path": record.target_path,
            "status": record.status,
            "checksum": record.checksum,
        }),
    )
    .await;

    Ok(Json(record))
}

pub async fn verify_backup(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<VerifyBackupResult>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let res = BackupService::verify_backup(&pool, &id).await?;

    let _ = AuditService::log_event(
        &pool,
        None,
        Some(&user.user_id),
        "VERIFY_BACKUP",
        Some("BACKUP"),
        Some(&id),
        None,
        serde_json::json!({
            "is_valid": res.is_valid,
            "status": res.status,
        }),
    )
    .await;

    Ok(Json(res))
}

pub async fn export_backup_data(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    use sqlx::Row;

    // 1. Workspaces
    let workspaces: Vec<serde_json::Value> = sqlx::query(
        "SELECT id, code, name, description, status, created_at, deactivated_at FROM workspaces ORDER BY name ASC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "code": r.get::<String, _>("code"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<Option<String>, _>("description"),
            "status": r.get::<String, _>("status"),
            "created_at": r.get::<String, _>("created_at"),
            "deactivated_at": r.get::<Option<String>, _>("deactivated_at"),
        })
    })
    .collect();

    // 2. Users (excluding password hash)
    let users: Vec<serde_json::Value> = sqlx::query(
        "SELECT u.id, u.workspace_id, w.name as workspace_name, u.username, u.full_name, u.role, u.status, u.created_at, u.last_login_at, u.qualification 
         FROM users u 
         LEFT JOIN workspaces w ON w.id = u.workspace_id 
         ORDER BY u.created_at DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "workspace_id": r.get::<Option<String>, _>("workspace_id"),
            "workspace_name": r.get::<Option<String>, _>("workspace_name"),
            "username": r.get::<String, _>("username"),
            "full_name": r.get::<String, _>("full_name"),
            "role": r.get::<String, _>("role"),
            "status": r.get::<String, _>("status"),
            "created_at": r.get::<String, _>("created_at"),
            "last_login_at": r.get::<Option<String>, _>("last_login_at"),
            "qualification": r.get::<Option<String>, _>("qualification"),
        })
    })
    .collect();

    // 3. Patients
    let patients: Vec<serde_json::Value> = sqlx::query(
        "SELECT p.id, p.workspace_id, w.name as workspace_name, p.patient_code, p.opd_case_id, p.full_name, p.date_of_birth, p.sex, p.phone, p.address, p.emergency_contact, p.status, p.created_at 
         FROM patients p 
         LEFT JOIN workspaces w ON w.id = p.workspace_id 
         ORDER BY p.patient_code ASC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "workspace_name": r.get::<Option<String>, _>("workspace_name"),
            "patient_code": r.get::<String, _>("patient_code"),
            "opd_case_id": r.get::<Option<String>, _>("opd_case_id"),
            "full_name": r.get::<String, _>("full_name"),
            "date_of_birth": r.get::<Option<String>, _>("date_of_birth"),
            "sex": r.get::<Option<String>, _>("sex"),
            "phone": r.get::<Option<String>, _>("phone"),
            "address": r.get::<Option<String>, _>("address"),
            "emergency_contact": r.get::<Option<String>, _>("emergency_contact"),
            "status": r.get::<String, _>("status"),
            "created_at": r.get::<String, _>("created_at"),
        })
    })
    .collect();

    // 4. Visits
    let visits: Vec<serde_json::Value> = sqlx::query(
        "SELECT v.id, v.workspace_id, w.name as workspace_name, v.visit_number, v.visit_date, v.purpose, v.status, v.finalized_at, v.created_at,
                p.patient_code, p.full_name as patient_name,
                u.full_name as doctor_name
         FROM visits v
         LEFT JOIN workspaces w ON w.id = v.workspace_id
         LEFT JOIN patients p ON p.id = v.patient_id
         LEFT JOIN users u ON u.id = v.doctor_id
         ORDER BY v.visit_date DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "workspace_name": r.get::<Option<String>, _>("workspace_name"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<Option<String>, _>("patient_code"),
            "patient_name": r.get::<Option<String>, _>("patient_name"),
            "doctor_name": r.get::<Option<String>, _>("doctor_name"),
            "visit_date": r.get::<String, _>("visit_date"),
            "purpose": r.get::<Option<String>, _>("purpose"),
            "status": r.get::<String, _>("status"),
            "finalized_at": r.get::<Option<String>, _>("finalized_at"),
            "created_at": r.get::<String, _>("created_at"),
        })
    })
    .collect();

    // 5. Vitals
    let vitals: Vec<serde_json::Value> = sqlx::query(
        "SELECT vt.id, vt.visit_id, v.visit_number, p.patient_code, p.full_name as patient_name,
                vt.temperature, vt.pulse_rate, vt.respiratory_rate, vt.systolic_bp, vt.diastolic_bp, vt.oxygen_saturation, vt.height_cm, vt.weight_kg, vt.notes, vt.recorded_at,
                u.full_name as recorded_by_name
         FROM vitals vt
         JOIN visits v ON v.id = vt.visit_id
         JOIN patients p ON p.id = v.patient_id
         LEFT JOIN users u ON u.id = vt.recorded_by
         ORDER BY vt.recorded_at DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "patient_name": r.get::<String, _>("patient_name"),
            "temperature": r.get::<Option<f64>, _>("temperature"),
            "pulse_rate": r.get::<Option<i64>, _>("pulse_rate"),
            "respiratory_rate": r.get::<Option<i64>, _>("respiratory_rate"),
            "systolic_bp": r.get::<Option<i64>, _>("systolic_bp"),
            "diastolic_bp": r.get::<Option<i64>, _>("diastolic_bp"),
            "oxygen_saturation": r.get::<Option<f64>, _>("oxygen_saturation"),
            "height_cm": r.get::<Option<f64>, _>("height_cm"),
            "weight_kg": r.get::<Option<f64>, _>("weight_kg"),
            "notes": r.get::<Option<String>, _>("notes"),
            "recorded_by_name": r.get::<Option<String>, _>("recorded_by_name"),
            "recorded_at": r.get::<String, _>("recorded_at"),
        })
    })
    .collect();

    // 6. Complaints & History
    let complaints: Vec<serde_json::Value> = sqlx::query(
        "SELECT c.id, c.visit_id, v.visit_number, p.patient_code, p.full_name as patient_name,
                c.chief_complaint, c.history_text, c.past_history, c.family_history, c.personal_history, c.recorded_at
         FROM complaints_history c
         JOIN visits v ON v.id = c.visit_id
         JOIN patients p ON p.id = v.patient_id
         ORDER BY c.recorded_at DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "patient_name": r.get::<String, _>("patient_name"),
            "chief_complaint": r.get::<Option<String>, _>("chief_complaint"),
            "history_text": r.get::<Option<String>, _>("history_text"),
            "past_history": r.get::<Option<String>, _>("past_history"),
            "family_history": r.get::<Option<String>, _>("family_history"),
            "personal_history": r.get::<Option<String>, _>("personal_history"),
            "recorded_at": r.get::<String, _>("recorded_at"),
        })
    })
    .collect();

    // 6b. Structured Individual Complaints
    let complaint_items: Vec<serde_json::Value> = sqlx::query(
        "SELECT vc.id, vc.visit_id, v.visit_number, p.patient_code,
                vc.complaint_text, vc.duration_value, vc.duration_unit, vc.notes
         FROM visit_complaints vc
         JOIN visits v ON v.id = vc.visit_id
         JOIN patients p ON p.id = v.patient_id
         ORDER BY vc.created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "complaint_text": r.get::<String, _>("complaint_text"),
            "duration_value": r.get::<Option<i64>, _>("duration_value"),
            "duration_unit": r.get::<Option<String>, _>("duration_unit"),
            "notes": r.get::<Option<String>, _>("notes"),
        })
    })
    .collect();

    // 7. AYUSH Case Taking
    let ayush_assessments: Vec<serde_json::Value> = sqlx::query(
        "SELECT a.id, a.visit_id, v.visit_number, p.patient_code, p.full_name as patient_name,
                a.data_json, a.schema_version, a.recorded_at
         FROM ayush_case_taking a
         JOIN visits v ON v.id = a.visit_id
         JOIN patients p ON p.id = v.patient_id
         ORDER BY a.recorded_at DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        let raw_json = r.get::<String, _>("data_json");
        let parsed: serde_json::Value = serde_json::from_str(&raw_json).unwrap_or(serde_json::json!({}));
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "patient_name": r.get::<String, _>("patient_name"),
            "prakriti": parsed.get("prakriti").and_then(|v| v.as_str()),
            "nadi": parsed.get("nadi").and_then(|v| v.as_str()),
            "agni": parsed.get("agni").and_then(|v| v.as_str()),
            "koshtha": parsed.get("koshtha").and_then(|v| v.as_str()),
            "notes": parsed.get("notes").and_then(|v| v.as_str()),
            "data_json": raw_json,
            "recorded_at": r.get::<String, _>("recorded_at"),
        })
    })
    .collect();

    // 8. Diagnoses
    let diagnoses: Vec<serde_json::Value> = sqlx::query(
        "SELECT vd.id, vd.visit_id, v.visit_number, p.patient_code, p.full_name as patient_name,
                d.code as diagnosis_code, d.name as diagnosis_name, vd.diagnosis_text, vd.selected_at,
                u.full_name as doctor_name
         FROM visit_diagnoses vd
         JOIN visits v ON v.id = vd.visit_id
         JOIN patients p ON p.id = v.patient_id
         JOIN diagnosis_catalog d ON d.id = vd.diagnosis_id
         LEFT JOIN users u ON u.id = vd.selected_by
         ORDER BY vd.selected_at DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "patient_name": r.get::<String, _>("patient_name"),
            "diagnosis_code": r.get::<String, _>("diagnosis_code"),
            "diagnosis_name": r.get::<String, _>("diagnosis_name"),
            "diagnosis_text": r.get::<Option<String>, _>("diagnosis_text"),
            "doctor_name": r.get::<Option<String>, _>("doctor_name"),
            "selected_at": r.get::<String, _>("selected_at"),
        })
    })
    .collect();

    // 9. Prescriptions
    let prescriptions: Vec<serde_json::Value> = sqlx::query(
        "SELECT pr.id, pr.visit_id, v.visit_number, p.patient_code, p.full_name as patient_name,
                u.full_name as doctor_name, pr.status, pr.created_at, pr.finalized_at
         FROM prescriptions pr
         JOIN visits v ON v.id = pr.visit_id
         JOIN patients p ON p.id = v.patient_id
         LEFT JOIN users u ON u.id = pr.created_by
         ORDER BY pr.created_at DESC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "patient_name": r.get::<String, _>("patient_name"),
            "doctor_name": r.get::<Option<String>, _>("doctor_name"),
            "status": r.get::<String, _>("status"),
            "created_at": r.get::<String, _>("created_at"),
            "finalized_at": r.get::<Option<String>, _>("finalized_at"),
        })
    })
    .collect();

    // 9b. Prescription Items
    let rx_items: Vec<serde_json::Value> = sqlx::query(
        "SELECT pi.id, pi.prescription_id, pr.visit_id, v.visit_number, p.patient_code, p.full_name as patient_name,
                pi.medicine_name_snapshot, m.name_hi as medicine_name_hi, m.form as medicine_form,
                pi.dosage_text, pi.frequency_text, pi.duration_text, pi.anupana_text, pi.pathya_text, pi.apathya_text,
                pi.source_type, pi.created_at, pr.status as rx_status
         FROM prescription_items pi
         JOIN prescriptions pr ON pr.id = pi.prescription_id
         JOIN visits v ON v.id = pr.visit_id
         JOIN patients p ON p.id = v.patient_id
         LEFT JOIN medicines m ON m.id = pi.medicine_id
         ORDER BY pi.created_at ASC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "visit_number": r.get::<String, _>("visit_number"),
            "patient_code": r.get::<String, _>("patient_code"),
            "patient_name": r.get::<String, _>("patient_name"),
            "medicine_name": r.get::<String, _>("medicine_name_snapshot"),
            "medicine_name_hi": r.get::<Option<String>, _>("medicine_name_hi"),
            "form": r.get::<Option<String>, _>("medicine_form"),
            "dosage": r.get::<Option<String>, _>("dosage_text"),
            "frequency": r.get::<Option<String>, _>("frequency_text"),
            "duration": r.get::<Option<String>, _>("duration_text"),
            "anupana": r.get::<Option<String>, _>("anupana_text"),
            "pathya": r.get::<Option<String>, _>("pathya_text"),
            "apathya": r.get::<Option<String>, _>("apathya_text"),
            "source_type": r.get::<String, _>("source_type"),
            "rx_status": r.get::<String, _>("rx_status"),
            "created_at": r.get::<String, _>("created_at"),
        })
    })
    .collect();

    // 10. Master Medicines Catalog
    let medicines: Vec<serde_json::Value> = sqlx::query(
        "SELECT id, code, name, name_hi, form, strength, description, status, created_at FROM medicines ORDER BY name ASC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "code": r.get::<String, _>("code"),
            "name": r.get::<String, _>("name"),
            "name_hi": r.get::<Option<String>, _>("name_hi"),
            "form": r.get::<Option<String>, _>("form"),
            "strength": r.get::<Option<String>, _>("strength"),
            "description": r.get::<Option<String>, _>("description"),
            "status": r.get::<String, _>("status"),
            "created_at": r.get::<String, _>("created_at"),
        })
    })
    .collect();

    // 11. Clinical Rules
    let rules: Vec<serde_json::Value> = sqlx::query(
        "SELECT cr.id, cr.rule_code, d.code as diagnosis_code, d.name as diagnosis_name, cr.version, cr.status, cr.anupana, cr.pathya, cr.apathya, cr.criteria_json, cr.validated_at
         FROM clinical_rules cr
         JOIN diagnosis_catalog d ON d.id = cr.diagnosis_id
         ORDER BY cr.rule_code ASC"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "rule_code": r.get::<String, _>("rule_code"),
            "diagnosis_code": r.get::<String, _>("diagnosis_code"),
            "diagnosis_name": r.get::<String, _>("diagnosis_name"),
            "version": r.get::<i64, _>("version"),
            "status": r.get::<String, _>("status"),
            "anupana": r.get::<Option<String>, _>("anupana"),
            "pathya": r.get::<Option<String>, _>("pathya"),
            "apathya": r.get::<Option<String>, _>("apathya"),
            "criteria_json": r.get::<String, _>("criteria_json"),
            "validated_at": r.get::<Option<String>, _>("validated_at"),
        })
    })
    .collect();

    // 12. Audit Logs (recent 1000)
    let audit_logs: Vec<serde_json::Value> = sqlx::query(
        "SELECT a.id, a.workspace_id, w.name as workspace_name, a.user_id, u.full_name as user_name, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at
         FROM audit_logs a
         LEFT JOIN workspaces w ON w.id = a.workspace_id
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 1000"
    )
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "workspace_name": r.get::<Option<String>, _>("workspace_name"),
            "user_name": r.get::<Option<String>, _>("user_name"),
            "action": r.get::<String, _>("action"),
            "entity_type": r.get::<Option<String>, _>("entity_type"),
            "entity_id": r.get::<Option<String>, _>("entity_id"),
            "details_json": r.get::<String, _>("details_json"),
            "created_at": r.get::<String, _>("created_at"),
        })
    })
    .collect();

    // 13. Backup Records
    let backup_records = BackupService::list_backups(&pool).await?;

    let now_str = chrono::Utc::now().to_rfc3339();

    // Log the Excel backup export event in Audit
    let _ = AuditService::log_event(
        &pool,
        None,
        Some(&user.user_id),
        "EXPORT_EXCEL_BACKUP",
        Some("BACKUP"),
        None,
        None,
        serde_json::json!({
            "exported_at": now_str,
            "exported_by": user.username,
            "total_patients": patients.len(),
            "total_visits": visits.len(),
            "total_prescriptions": prescriptions.len(),
        }),
    )
    .await;

    let payload = serde_json::json!({
        "metadata": {
            "system_name": "AYURCASE Clinical Healthcare System",
            "server_role": "SIXSENSE Authoritative Central Server",
            "export_timestamp": now_str,
            "exported_by": user.full_name,
            "authority_username": user.username,
            "counts": {
                "workspaces": workspaces.len(),
                "users": users.len(),
                "patients": patients.len(),
                "visits": visits.len(),
                "vitals": vitals.len(),
                "complaints": complaints.len(),
                "ayush_assessments": ayush_assessments.len(),
                "diagnoses": diagnoses.len(),
                "prescriptions": prescriptions.len(),
                "prescription_items": rx_items.len(),
                "medicines": medicines.len(),
                "clinical_rules": rules.len(),
                "audit_logs": audit_logs.len(),
                "backup_records": backup_records.len(),
            }
        },
        "workspaces": workspaces,
        "users": users,
        "patients": patients,
        "visits": visits,
        "vitals": vitals,
        "complaints": complaints,
        "complaint_items": complaint_items,
        "ayush_assessments": ayush_assessments,
        "diagnoses": diagnoses,
        "prescriptions": prescriptions,
        "prescription_items": rx_items,
        "medicines": medicines,
        "clinical_rules": rules,
        "audit_logs": audit_logs,
        "backup_records": backup_records,
    });

    Ok(Json(payload))
}
