use crate::error::AppError;
use crate::models::document::Document;
use crate::models::patient::Patient;
use crate::models::prescription::{Prescription, PrescriptionItem};
use crate::models::visit::{
    format_display_date, format_display_dob, AyushCaseTaking, ComplaintsHistory, Visit, Vitals,
};
use crate::repositories::DbPool;
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

pub fn sanitize_folder_name(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut last_was_underscore = false;
    for c in input.chars() {
        if c.is_alphanumeric() || c == '-' || c == '_' {
            result.push(c);
            last_was_underscore = false;
        } else if !last_was_underscore {
            result.push('_');
            last_was_underscore = true;
        }
    }
    let trimmed = result.trim_matches('_');
    if trimmed.is_empty() {
        "General".to_string()
    } else {
        trimmed.to_string()
    }
}

pub struct DocumentService;

impl DocumentService {
    pub async fn generate_case_sheet(
        pool: &DbPool,
        _documents_dir: &Path,
        visit_id: &str,
        generated_by: &str,
    ) -> Result<Document, AppError> {
        // 1. Fetch Visit (includes opd_number and patient_visit_seq for display)
        let visit: Option<Visit> = sqlx::query_as(
            "SELECT id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
             FROM visits WHERE id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let vis = match visit {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };

        // 2. Fetch Patient
        let patient: Patient = sqlx::query_as(
            "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
             FROM patients WHERE id = ?"
        )
        .bind(&vis.patient_id)
        .fetch_one(pool)
        .await?;

        // 3. Fetch Doctor name
        let doc_row: Option<(String, Option<String>)> = sqlx::query_as("SELECT full_name, qualification FROM users WHERE id = ?")
            .bind(&vis.doctor_id)
            .fetch_optional(pool)
            .await?;
        let (raw_doc_name, doc_qual) = doc_row.unwrap_or(("Treating Physician".to_string(), None));
        let doc_name_str = match doc_qual {
            Some(ref q) if !q.trim().is_empty() => format!("{}, {}", raw_doc_name, q.trim()),
            _ => raw_doc_name,
        };
        let doc_name = (doc_name_str,);

        // 3b. Fetch Workspace / Department name
        let dept_name: String = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
            .bind(&vis.workspace_id)
            .fetch_optional(pool)
            .await?
            .map(|r| r.0)
            .unwrap_or_else(|| "General Medicine".to_string());

        // 4. Fetch Vitals
        let vitals: Option<Vitals> = sqlx::query_as(
            "SELECT id, visit_id, temperature, pulse_rate, respiratory_rate, systolic_bp, diastolic_bp, oxygen_saturation, height_cm, weight_kg, notes, recorded_by, recorded_at
             FROM vitals WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        // 5. Fetch Complaints
        let complaints: Option<ComplaintsHistory> = sqlx::query_as(
            "SELECT id, visit_id, chief_complaint, history_text, past_history, family_history, personal_history, recorded_by, recorded_at, updated_at
             FROM complaints_history WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        // 5b. Fetch Individual Repeatable Complaints with Durations
        let complaint_items: Vec<crate::models::visit::VisitComplaint> = sqlx::query_as(
            "SELECT id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at
             FROM visit_complaints WHERE visit_id = ?
             ORDER BY sort_order ASC, created_at ASC"
        )
        .bind(visit_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        // 6. Fetch AYUSH Case Taking
        let ayush: Option<AyushCaseTaking> = sqlx::query_as(
            "SELECT id, visit_id, data_json, schema_version, recorded_by, recorded_at, updated_at
             FROM ayush_case_taking WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        // 7. Fetch Diagnoses with NAMC codes
        let diagnoses: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT d.code, d.name, COALESCE(vd.diagnosis_text, '')
             FROM visit_diagnoses vd
             JOIN diagnosis_catalog d ON d.id = vd.diagnosis_id
             WHERE vd.visit_id = ?
             ORDER BY vd.selected_at ASC"
        )
        .bind(visit_id)
        .fetch_all(pool)
        .await?;

        // 8. Fetch Prescription & Items
        let prescription: Option<Prescription> = sqlx::query_as(
            "SELECT id, visit_id, status, source_rule_id, source_rule_version, created_by, finalized_by, created_at, updated_at, finalized_at
             FROM prescriptions WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let rx_items: Vec<PrescriptionItem> = if let Some(ref p) = prescription {
            sqlx::query_as(
                "SELECT id, prescription_id, medicine_id, medicine_name_snapshot, dosage_text, frequency_text, duration_text, anupana_text, pathya_text, apathya_text, source_type, rule_id, rule_version, created_at
                 FROM prescription_items WHERE prescription_id = ?
                 ORDER BY created_at ASC"
            )
            .bind(&p.id)
            .fetch_all(pool)
            .await?
        } else {
            Vec::new()
        };

        // 8b. Fetch Hindi names for bilingual medicine formatting
        let med_rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT id, name_hi FROM medicines")
            .fetch_all(pool)
            .await
            .unwrap_or_default();
        let med_map: HashMap<String, Option<String>> = med_rows.into_iter().collect();

        // 9. Build Hierarchical Sanitized Storage Path:
        let target_dir = crate::services::storage_service::PatientStorageService::ensure_patient_folder(
            &dept_name,
            &doc_name.0,
            &patient.patient_code,
        )?;

        // 10. Render Print-Ready Clinical Document HTML (in memory only — not written to disk)
        let _html_content = render_case_sheet_html(
            &vis,
            &patient,
            &doc_name.0,
            &dept_name,
            vitals.as_ref(),
            complaints.as_ref(),
            &complaint_items,
            ayush.as_ref(),
            &diagnoses,
            prescription.as_ref(),
            &rx_items,
            &med_map,
        );

        // 11. Write Case Sheet PDF only (HTML is kept in memory for the PDF render pipeline)
        let doc_id = format!("doc_{}", Uuid::now_v7());

        // Deterministic professional filename: CaseSheet_PATIENTCODE_YYYY-MM-DD.pdf
        let date_suffix = vis.visit_date.split(['T', ' ']).next().unwrap_or("date").to_string();
        let base_pdf_name = format!("CaseSheet_{}_{}.pdf", patient.patient_code, date_suffix);
        // Collision-safe: if file already exists for this patient+date, append -2, -3
        let mut pdf_filename = base_pdf_name.clone();
        let mut file_suffix = 1u32;
        while target_dir.join(&pdf_filename).exists() {
            file_suffix += 1;
            let stem = format!("CaseSheet_{}_{}", patient.patient_code, date_suffix);
            pdf_filename = format!("{}-{}.pdf", stem, file_suffix);
        }
        let pdf_file_path = target_dir.join(&pdf_filename);
        let file_path_str = pdf_file_path.to_string_lossy().to_string();

        // Build clinical-grade OPD identifier for display
        let visit_date_display = format_display_date(&vis.visit_date);
        let opd_display = match vis.opd_number.as_deref() {
            Some(opd) if !opd.trim().is_empty() && opd != "None" && opd != "null" => opd.to_string(),
            _ => format!("{}/{}", patient.patient_code, visit_date_display),
        };
        let visit_no_display = match vis.patient_visit_seq {
            Some(seq) => format!("{:02}", seq),
            None => {
                let digits: String = vis.visit_number.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(num) = digits.parse::<u32>() {
                    format!("{:02}", num)
                } else if !vis.visit_number.trim().is_empty() {
                    vis.visit_number.clone()
                } else {
                    "01".to_string()
                }
            }
        };
        let dob_display = match format_display_dob(patient.date_of_birth.as_deref()) {
            Some(d) if !d.trim().is_empty() && d != "-" && d != "None" && d != "null" => d,
            _ => "-".to_string(),
        };
        let gender_display = match patient.sex.as_deref() {
            Some(s) if !s.trim().is_empty() && s != "None" && s != "null" => s.to_string(),
            _ => "Unspecified".to_string(),
        };
        let phone_display = match patient.phone.as_deref() {
            Some(p) if !p.trim().is_empty() && p != "None" && p != "null" => p.to_string(),
            _ => "-".to_string(),
        };

        // Format comprehensive structured lines for PDF
        let mut pdf_lines: Vec<String> = Vec::new();
        pdf_lines.push("AYURCASE CLINICAL CASE SHEET".to_string());
        pdf_lines.push(format!("Department: {}", dept_name));
        pdf_lines.push("Ayurveda Clinical Case Record & Prescription".to_string());
        pdf_lines.push(format!("Doctor: {}", doc_name.0));
        pdf_lines.push(format!("Treating Physician: {}", doc_name.0));
        pdf_lines.push(format!("Date: {}", visit_date_display));
        pdf_lines.push("--------------------------------------------------------------------------------".to_string());
        pdf_lines.push("PATIENT PROFILE".to_string());
        pdf_lines.push(format!("  Patient Name: {}", patient.full_name));
        pdf_lines.push(format!("  Patient Code: {}", patient.patient_code));
        pdf_lines.push(format!("  OPD No.:      {}", opd_display));
        pdf_lines.push(format!("  Visit No.:    {}", visit_no_display));
        pdf_lines.push(format!("  Gender:       {}", gender_display));
        pdf_lines.push(format!("  DOB:          {}", dob_display));
        if phone_display != "-" {
            pdf_lines.push(format!("  Contact:      {}", phone_display));
        }
        pdf_lines.push("--------------------------------------------------------------------------------".to_string());
        
        pdf_lines.push("CLINICAL VITALS:".to_string());
        if let Some(ref v) = vitals {
            pdf_lines.push(format!(
                "  BP: {}/{} mmHg | Pulse: {} bpm | Resp: {} /min",
                v.systolic_bp.unwrap_or(0),
                v.diastolic_bp.unwrap_or(0),
                v.pulse_rate.unwrap_or(0),
                v.respiratory_rate.unwrap_or(0),
            ));
            pdf_lines.push(format!(
                "  Temp: {} F | SpO2: {}% | Wt: {} kg | Ht: {} cm",
                v.temperature.unwrap_or(0.0),
                v.oxygen_saturation.unwrap_or(0.0),
                v.weight_kg.unwrap_or(0.0),
                v.height_cm.unwrap_or(0.0),
            ));
        } else {
            pdf_lines.push("  No vitals recorded".to_string());
        }
        pdf_lines.push("--------------------------------------------------------------------------------".to_string());

        pdf_lines.push("CHIEF COMPLAINTS (PRADHANA VEDANA):".to_string());
        if !complaint_items.is_empty() {
            for (idx, item) in complaint_items.iter().enumerate() {
                let dur = match (item.duration_value, &item.duration_unit) {
                    (Some(val), Some(unit)) => format!(" (Duration: {} {})", val, unit),
                    (Some(val), None) => format!(" (Duration: {})", val),
                    _ => String::new(),
                };
                pdf_lines.push(format!("  {}. {}{}", idx + 1, item.complaint_text, dur));
            }
        } else if let Some(ref c) = complaints {
            if let Some(ref cc) = c.chief_complaint {
                pdf_lines.push(format!("  - {}", cc));
            } else {
                pdf_lines.push("  None recorded".to_string());
            }
        } else {
            pdf_lines.push("  None recorded".to_string());
        }

        if let Some(ref c) = complaints {
            if let Some(ref h) = c.history_text {
                if !h.trim().is_empty() {
                    pdf_lines.push(format!("Clinical History: {}", h));
                }
            }
        }
        pdf_lines.push("--------------------------------------------------------------------------------".to_string());

        pdf_lines.push("DOCTOR DIAGNOSIS (MANUAL):".to_string());
        if diagnoses.is_empty() {
            pdf_lines.push("  No diagnosis recorded".to_string());
        } else {
            for (code, name, notes) in &diagnoses {
                if notes.is_empty() {
                    pdf_lines.push(format!("  [{}] {}", code, name));
                } else {
                    pdf_lines.push(format!("  [{}] {} - {}", code, name, notes));
                }
            }
        }
        pdf_lines.push("--------------------------------------------------------------------------------".to_string());

        pdf_lines.push(format!("PRESCRIPTION (Status: {}):", prescription.as_ref().map(|p| p.status.as_str()).unwrap_or("NOT_PRESCRIBED")));
        if rx_items.is_empty() {
            pdf_lines.push("  No medicines prescribed".to_string());
        } else {
            for (idx, item) in rx_items.iter().enumerate() {
                pdf_lines.push(format!(
                    "  {}. {} | Dose: {} | Freq: {} | Dur: {} | Anupana: {}",
                    idx + 1,
                    item.medicine_name_snapshot,
                    item.dosage_text.as_deref().unwrap_or("-"),
                    item.frequency_text.as_deref().unwrap_or("-"),
                    item.duration_text.as_deref().unwrap_or("-"),
                    item.anupana_text.as_deref().unwrap_or("-")
                ));
            }
        }
        pdf_lines.push("--------------------------------------------------------------------------------".to_string());
        pdf_lines.push(format!("Treating Physician Signature: {}", doc_name.0));
        pdf_lines.push("SIXSENSE Server - AYURCASE Clinical Record System".to_string());

        let pdf_bytes = generate_minimal_pdf(
            &format!("AYURCASE CASE SHEET — Visit No.{} | OPD: {} | Patient: {}",
                visit_no_display,
                if opd_display.is_empty() { &patient.patient_code } else { &opd_display },
                patient.patient_code
            ),
            &pdf_lines,
        );
        std::fs::write(&pdf_file_path, &pdf_bytes)
            .map_err(|e| AppError::Internal(format!("Failed to write case sheet PDF: {}", e)))?;

        // HTML was rendered in memory above for the render pipeline; no disk write needed.

        // 12. Calculate SHA256 of primary Case Sheet
        let mut hasher = Sha256::new();
        hasher.update(&pdf_bytes);
        let file_hash = hex::encode(hasher.finalize());

        // 13. Save metadata to documents table (authoritative source of truth)
        let now_str = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO documents (id, visit_id, document_type, file_path, file_hash, generated_by, generated_at)
             VALUES (?, ?, 'CASE_SHEET_PDF', ?, ?, ?, ?)"
        )
        .bind(&doc_id)
        .bind(visit_id)
        .bind(&file_path_str)
        .bind(&file_hash)
        .bind(generated_by)
        .bind(&now_str)
        .execute(pool)
        .await?;

        Ok(Document {
            id: doc_id,
            visit_id: visit_id.to_string(),
            document_type: "CASE_SHEET_PDF".to_string(),
            file_path: file_path_str,
            file_hash: Some(file_hash),
            generated_by: generated_by.to_string(),
            generated_at: now_str,
        })
    }

    pub async fn generate_prescription(
        pool: &DbPool,
        _documents_dir: &Path,
        visit_id: &str,
        generated_by: &str,
    ) -> Result<Document, AppError> {
        // 1. Fetch Visit (includes opd_number and patient_visit_seq for display)
        let visit: Option<Visit> = sqlx::query_as(
            "SELECT id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
             FROM visits WHERE id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let vis = match visit {
            Some(v) => v,
            None => return Err(AppError::NotFound(format!("Visit '{}' not found", visit_id))),
        };


        let patient: Patient = sqlx::query_as(
            "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
             FROM patients WHERE id = ?"
        )
        .bind(&vis.patient_id)
        .fetch_one(pool)
        .await?;

        let doc_row: Option<(String, Option<String>)> = sqlx::query_as("SELECT full_name, qualification FROM users WHERE id = ?")
            .bind(&vis.doctor_id)
            .fetch_optional(pool)
            .await?;
        let (raw_doc_name, doc_qual) = doc_row.unwrap_or(("Treating Physician".to_string(), None));
        let doc_name_str = match doc_qual {
            Some(ref q) if !q.trim().is_empty() => format!("{}, {}", raw_doc_name, q.trim()),
            _ => raw_doc_name,
        };
        let doc_name = (doc_name_str,);

        let dept_name: String = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
            .bind(&vis.workspace_id)
            .fetch_optional(pool)
            .await?
            .map(|r| r.0)
            .unwrap_or_else(|| "General Medicine".to_string());

        let prescription: Option<Prescription> = sqlx::query_as(
            "SELECT id, visit_id, status, source_rule_id, source_rule_version, created_by, finalized_by, created_at, updated_at, finalized_at
             FROM prescriptions WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let rx = prescription.ok_or_else(|| AppError::NotFound("No prescription found for this visit".to_string()))?;

        if rx.status != "FINALIZED" {
            return Err(AppError::BadRequest(
                "Cannot generate official prescription document: prescription is not finalized".to_string(),
            ));
        }

        let items: Vec<PrescriptionItem> = sqlx::query_as(
            "SELECT id, prescription_id, medicine_id, medicine_name_snapshot, dosage_text, frequency_text, duration_text, anupana_text, pathya_text, apathya_text, source_type, rule_id, rule_version, created_at
             FROM prescription_items WHERE prescription_id = ?
             ORDER BY created_at ASC"
        )
        .bind(&rx.id)
        .fetch_all(pool)
        .await?;

        // 4. Fetch Clinical Vitals
        let vitals: Option<Vitals> = sqlx::query_as(
            "SELECT id, visit_id, temperature, pulse_rate, respiratory_rate, systolic_bp, diastolic_bp, oxygen_saturation, height_cm, weight_kg, notes, recorded_by, recorded_at
             FROM vitals WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        // 5. Fetch Complaints History & Items
        let complaints: Option<ComplaintsHistory> = sqlx::query_as(
            "SELECT id, visit_id, chief_complaint, history_text, past_history, family_history, personal_history, recorded_by, recorded_at, updated_at
             FROM complaints_history WHERE visit_id = ?"
        )
        .bind(visit_id)
        .fetch_optional(pool)
        .await?;

        let complaint_items: Vec<crate::models::visit::VisitComplaint> = sqlx::query_as(
            "SELECT id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at
             FROM visit_complaints WHERE visit_id = ?
             ORDER BY sort_order ASC, created_at ASC"
        )
        .bind(visit_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        // 6. Fetch Diagnoses with NAMC codes
        let diagnoses: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT d.code, d.name, COALESCE(vd.diagnosis_text, '')
             FROM visit_diagnoses vd
             JOIN diagnosis_catalog d ON d.id = vd.diagnosis_id
             WHERE vd.visit_id = ?
             ORDER BY vd.selected_at ASC"
        )
        .bind(visit_id)
        .fetch_all(pool)
        .await?;

        let med_rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT id, name_hi FROM medicines")
            .fetch_all(pool)
            .await
            .unwrap_or_default();
        let med_map: HashMap<String, Option<String>> = med_rows.into_iter().collect();

        let target_dir = crate::services::storage_service::PatientStorageService::ensure_patient_folder(
            &dept_name,
            &doc_name.0,
            &patient.patient_code,
        )?;

        let _rx_html = render_prescription_html(
            &vis,
            &patient,
            &doc_name.0,
            &dept_name,
            vitals.as_ref(),
            complaints.as_ref(),
            &complaint_items,
            &diagnoses,
            Some(&rx),
            &items,
            &med_map,
        );

        let doc_id = format!("doc_{}", Uuid::now_v7());

        // Deterministic professional filename: Prescription_PATIENTCODE_YYYY-MM-DD.pdf
        let date_suffix = vis.visit_date.split(['T', ' ']).next().unwrap_or("date").to_string();
        let base_rx_name = format!("Prescription_{}_{}.pdf", patient.patient_code, date_suffix);
        let mut rx_pdf_filename = base_rx_name.clone();
        let mut file_suffix = 1u32;
        while target_dir.join(&rx_pdf_filename).exists() {
            file_suffix += 1;
            rx_pdf_filename = format!("Prescription_{}_{}-{}.pdf", patient.patient_code, date_suffix, file_suffix);
        }
        let rx_pdf_path = target_dir.join(&rx_pdf_filename);
        let file_path_str = rx_pdf_path.to_string_lossy().to_string();

        // Build clinical display values
        let visit_date_display = format_display_date(&vis.visit_date);
        let opd_display = match vis.opd_number.as_deref() {
            Some(opd) if !opd.trim().is_empty() && opd != "None" && opd != "null" => opd.to_string(),
            _ => format!("{}/{}", patient.patient_code, visit_date_display),
        };
        let visit_no_display = match vis.patient_visit_seq {
            Some(seq) => format!("{:02}", seq),
            None => {
                let digits: String = vis.visit_number.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(num) = digits.parse::<u32>() {
                    format!("{:02}", num)
                } else if !vis.visit_number.trim().is_empty() {
                    vis.visit_number.clone()
                } else {
                    "01".to_string()
                }
            }
        };
        let dob_display = match format_display_dob(patient.date_of_birth.as_deref()) {
            Some(d) if !d.trim().is_empty() && d != "-" && d != "None" && d != "null" => d,
            _ => "-".to_string(),
        };
        let gender_display = match patient.sex.as_deref() {
            Some(s) if !s.trim().is_empty() && s != "None" && s != "null" => s.to_string(),
            _ => "Unspecified".to_string(),
        };
        let phone_display = match patient.phone.as_deref() {
            Some(p) if !p.trim().is_empty() && p != "None" && p != "null" => p.to_string(),
            _ => "-".to_string(),
        };

        let mut lines = vec![
            "AYURCASE CLINICAL PRESCRIPTION".to_string(),
            format!("Department: {}", dept_name),
            format!("Doctor: {}", doc_name.0),
            format!("Date: {}", visit_date_display),
            "--------------------------------------------------------------------------------".to_string(),
            "PATIENT PROFILE".to_string(),
            format!("  Patient Name: {}", patient.full_name),
            format!("  Patient Code: {}", patient.patient_code),
            format!("  OPD No.:      {}", opd_display),
            format!("  Visit No.:    {}", visit_no_display),
            format!("  Gender:       {}", gender_display),
            format!("  DOB:          {}", dob_display),
        ];
        if phone_display != "-" {
            lines.push(format!("  Contact:      {}", phone_display));
        }
        lines.push(format!("Prescription Status: {}", rx.status));
        lines.push("--------------------------------------------------------------------------------".to_string());
        lines.push(format!("PRESCRIBED MEDICINES ({}):", items.len()));
        for (i, it) in items.iter().enumerate() {
            lines.push(format!(
                "{}. {} | Dose: {} | Freq: {} | Dur: {} | Anupana: {}",
                i + 1,
                it.medicine_name_snapshot,
                it.dosage_text.as_deref().unwrap_or("-"),
                it.frequency_text.as_deref().unwrap_or("-"),
                it.duration_text.as_deref().unwrap_or("-"),
                it.anupana_text.as_deref().unwrap_or("-")
            ));
            if let Some(ref p) = it.pathya_text {
                lines.push(format!("   Pathya: {}", p));
            }
            if let Some(ref a) = it.apathya_text {
                lines.push(format!("   Apathya: {}", a));
            }
        }
        lines.push("--------------------------------------------------------------------------------".to_string());
        lines.push(format!("Signature: {}", doc_name.0));
        lines.push("SIXSENSE Server - AYURCASE Clinical Record System".to_string());

        let pdf_bytes = generate_minimal_pdf(
            &format!("AYURCASE PRESCRIPTION — Visit No.{} | OPD: {} | Patient: {}",
                visit_no_display,
                if opd_display.is_empty() { &patient.patient_code } else { &opd_display },
                patient.patient_code
            ),
            &lines,
        );
        std::fs::write(&rx_pdf_path, &pdf_bytes)
            .map_err(|e| AppError::Internal(format!("Failed to write prescription PDF: {}", e)))?;

        let mut hasher = Sha256::new();
        hasher.update(&pdf_bytes);
        let file_hash = hex::encode(hasher.finalize());

        let now_str = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO documents (id, visit_id, document_type, file_path, file_hash, generated_by, generated_at)
             VALUES (?, ?, 'PRESCRIPTION_PDF', ?, ?, ?, ?)"
        )
        .bind(&doc_id)
        .bind(visit_id)
        .bind(&file_path_str)
        .bind(&file_hash)
        .bind(generated_by)
        .bind(&now_str)
        .execute(pool)
        .await?;

        Ok(Document {
            id: doc_id,
            visit_id: visit_id.to_string(),
            document_type: "PRESCRIPTION_PDF".to_string(),
            file_path: file_path_str,
            file_hash: Some(file_hash),
            generated_by: generated_by.to_string(),
            generated_at: now_str,
        })
    }

    pub async fn render_document_html(pool: &DbPool, doc_id: &str) -> Result<String, AppError> {
        let doc: Option<(String, String)> = sqlx::query_as(
            "SELECT visit_id, document_type FROM documents WHERE id = ?"
        )
        .bind(doc_id)
        .fetch_optional(pool)
        .await?;

        let (visit_id, doc_type) = doc.ok_or_else(|| AppError::NotFound(format!("Document '{}' not found", doc_id)))?;

        // 1. Fetch Visit
        let visit: Visit = sqlx::query_as(
            "SELECT id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status, created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
             FROM visits WHERE id = ?"
        )
        .bind(&visit_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Visit '{}' not found", visit_id)))?;

        // 2. Fetch Patient
        let patient: Patient = sqlx::query_as(
            "SELECT id, workspace_id, patient_code, opd_case_id, full_name, date_of_birth, sex, phone, address, emergency_contact, status, created_at, updated_at
             FROM patients WHERE id = ?"
        )
        .bind(&visit.patient_id)
        .fetch_one(pool)
        .await?;

        // 3. Fetch Doctor name
        let doc_row: Option<(String, Option<String>)> = sqlx::query_as("SELECT full_name, qualification FROM users WHERE id = ?")
            .bind(&visit.doctor_id)
            .fetch_optional(pool)
            .await?;
        let (raw_doc_name, doc_qual) = doc_row.unwrap_or(("Treating Physician".to_string(), None));
        let doc_name_str = match doc_qual {
            Some(ref q) if !q.trim().is_empty() => format!("{}, {}", raw_doc_name, q.trim()),
            _ => raw_doc_name,
        };

        // 3b. Fetch Workspace name
        let dept_name: String = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
            .bind(&visit.workspace_id)
            .fetch_optional(pool)
            .await?
            .map(|r| r.0)
            .unwrap_or_else(|| "General Medicine".to_string());

        // 4. Fetch Vitals
        let vitals: Option<Vitals> = sqlx::query_as(
            "SELECT id, visit_id, temperature, pulse_rate, respiratory_rate, systolic_bp, diastolic_bp, oxygen_saturation, height_cm, weight_kg, notes, recorded_by, recorded_at
             FROM vitals WHERE visit_id = ?"
        )
        .bind(&visit_id)
        .fetch_optional(pool)
        .await?;

        // 5. Fetch Complaints
        let complaints: Option<ComplaintsHistory> = sqlx::query_as(
            "SELECT id, visit_id, chief_complaint, history_text, past_history, family_history, personal_history, recorded_by, recorded_at, updated_at
             FROM complaints_history WHERE visit_id = ?"
        )
        .bind(&visit_id)
        .fetch_optional(pool)
        .await?;

        // 5b. Fetch Individual Complaints
        let complaint_items: Vec<crate::models::visit::VisitComplaint> = sqlx::query_as(
            "SELECT id, visit_id, complaint_text, duration_value, duration_unit, notes, sort_order, created_at
             FROM visit_complaints WHERE visit_id = ?
             ORDER BY sort_order ASC, created_at ASC"
        )
        .bind(&visit_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        // 6. Fetch AYUSH Case Taking
        let ayush: Option<AyushCaseTaking> = sqlx::query_as(
            "SELECT id, visit_id, data_json, schema_version, recorded_by, recorded_at, updated_at
             FROM ayush_case_taking WHERE visit_id = ?"
        )
        .bind(&visit_id)
        .fetch_optional(pool)
        .await?;

        // 7. Fetch Diagnoses
        let diagnoses: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT d.code, d.name, COALESCE(vd.diagnosis_text, '')
             FROM visit_diagnoses vd
             JOIN diagnosis_catalog d ON d.id = vd.diagnosis_id
             WHERE vd.visit_id = ?
             ORDER BY vd.selected_at ASC"
        )
        .bind(&visit_id)
        .fetch_all(pool)
        .await?;

        // 8. Fetch Prescription & Items
        let prescription: Option<Prescription> = sqlx::query_as(
            "SELECT id, visit_id, status, source_rule_id, source_rule_version, created_by, finalized_by, created_at, updated_at, finalized_at
             FROM prescriptions WHERE visit_id = ?"
        )
        .bind(&visit_id)
        .fetch_optional(pool)
        .await?;

        let rx_items: Vec<PrescriptionItem> = if let Some(ref p) = prescription {
            sqlx::query_as(
                "SELECT id, prescription_id, medicine_id, medicine_name_snapshot, dosage_text, frequency_text, duration_text, anupana_text, pathya_text, apathya_text, source_type, rule_id, rule_version, created_at
                 FROM prescription_items WHERE prescription_id = ?
                 ORDER BY created_at ASC"
            )
            .bind(&p.id)
            .fetch_all(pool)
            .await?
        } else {
            Vec::new()
        };

        // 8b. Fetch Hindi names
        let med_rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT id, name_hi FROM medicines")
            .fetch_all(pool)
            .await
            .unwrap_or_default();
        let med_map: HashMap<String, Option<String>> = med_rows.into_iter().collect();

        if doc_type == "PRESCRIPTION_PDF" {
            Ok(render_prescription_html(
                &visit,
                &patient,
                &doc_name_str,
                &dept_name,
                vitals.as_ref(),
                complaints.as_ref(),
                &complaint_items,
                &diagnoses,
                prescription.as_ref(),
                &rx_items,
                &med_map,
            ))
        } else {
            Ok(render_case_sheet_html(
                &visit,
                &patient,
                &doc_name_str,
                &dept_name,
                vitals.as_ref(),
                complaints.as_ref(),
                &complaint_items,
                ayush.as_ref(),
                &diagnoses,
                prescription.as_ref(),
                &rx_items,
                &med_map,
            ))
        }
    }
}

fn wrap_pdf_line(line: &str, max_chars: usize) -> Vec<String> {
    if line.len() <= max_chars || line.starts_with("---") {
        return vec![line.to_string()];
    }
    let mut wrapped = Vec::new();
    let mut current = String::new();
    for word in line.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if current.len() + 1 + word.len() <= max_chars {
            current.push(' ');
            current.push_str(word);
        } else {
            wrapped.push(current);
            current = format!("    {}", word);
        }
    }
    if !current.is_empty() {
        wrapped.push(current);
    }
    wrapped
}

pub fn sanitize_pdf_text(s: &str) -> String {
    let mut clean = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '(' => clean.push_str("\\("),
            ')' => clean.push_str("\\)"),
            '\\' => clean.push_str("\\\\"),
            '\r' | '\n' | '\t' => clean.push(' '),
            '—' | '–' => clean.push('-'),
            '"' | '“' | '”' => clean.push('"'),
            '\'' | '‘' | '’' => clean.push('\''),
            c if c.is_ascii() && !c.is_ascii_control() => clean.push(c),
            _ => clean.push(' '),
        }
    }
    clean
}

pub fn generate_minimal_pdf(title: &str, content_lines: &[String]) -> Vec<u8> {
    // 1. Wrap long lines to prevent text clipping beyond right margin (~86 chars max)
    let mut expanded_lines: Vec<String> = Vec::new();
    for line in content_lines {
        expanded_lines.extend(wrap_pdf_line(line, 86));
    }

    let lines_per_page = 40;
    let chunks: Vec<&[String]> = if expanded_lines.is_empty() {
        vec![&[]]
    } else {
        expanded_lines.chunks(lines_per_page).collect()
    };
    let num_pages = chunks.len();

    let mut offsets = Vec::new();
    let mut pdf = Vec::new();

    // Standard PDF 1.4 header with binary marker comment (ISO 32000-1 §7.5.2)
    pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    // Obj 1: Catalog
    offsets.push(pdf.len());
    pdf.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    // Obj 2: Pages
    offsets.push(pdf.len());
    let mut kids = String::new();
    for i in 0..num_pages {
        let p_obj = 4 + 2 * i;
        kids.push_str(&format!("{} 0 R ", p_obj));
    }
    pdf.extend_from_slice(
        format!(
            "2 0 obj\n<< /Type /Pages /Kids [{}] /Count {} >>\nendobj\n",
            kids.trim(),
            num_pages
        )
        .as_bytes(),
    );

    // Obj 3: Font
    offsets.push(pdf.len());
    pdf.extend_from_slice(
        b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    );

    // Generate Pages and Content Streams
    for (i, page_lines) in chunks.iter().enumerate() {
        let page_obj = 4 + 2 * i;
        let content_obj = 5 + 2 * i;

        offsets.push(pdf.len());
        pdf.extend_from_slice(
            format!(
                "{} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>\nendobj\n",
                page_obj, content_obj
            )
            .as_bytes(),
        );

        let mut text_stream = String::new();
        text_stream.push_str("BT\n/F1 13 Tf\n45 785 Td\n");
        let page_title = if num_pages > 1 {
            format!("{} (Page {} of {})", title, i + 1, num_pages)
        } else {
            title.to_string()
        };
        text_stream.push_str(&format!("({}) Tj\n", sanitize_pdf_text(&page_title)));
        text_stream.push_str("/F1 9 Tf\n0 -20 Td\n");

        for line in *page_lines {
            text_stream.push_str(&format!("({}) Tj\n0 -14 Td\n", sanitize_pdf_text(line)));
        }
        text_stream.push_str("ET");

        offsets.push(pdf.len());
        let stream_bytes = text_stream.as_bytes();
        pdf.extend_from_slice(
            format!(
                "{} 0 obj\n<< /Length {} >>\nstream\n",
                content_obj,
                stream_bytes.len()
            )
            .as_bytes(),
        );
        pdf.extend_from_slice(stream_bytes);
        pdf.extend_from_slice(b"\nendstream\nendobj\n");
    }

    let xref_pos = pdf.len();
    let total_objs = 3 + 2 * num_pages;
    pdf.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", total_objs + 1).as_bytes());
    for offset in &offsets {
        pdf.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            total_objs + 1,
            xref_pos
        )
        .as_bytes(),
    );

    pdf
}

fn format_bilingual_name(
    snapshot: &str,
    medicine_id: Option<&str>,
    med_map: &HashMap<String, Option<String>>,
) -> String {
    if let Some(mid) = medicine_id {
        if let Some(Some(hi)) = med_map.get(mid) {
            if !snapshot.contains(hi) && !hi.trim().is_empty() {
                return format!("{} ({})", snapshot, hi);
            }
        }
    }
    snapshot.to_string()
}

fn render_case_sheet_html(
    visit: &Visit,
    patient: &Patient,
    doctor_name: &str,
    dept_name: &str,
    vitals: Option<&Vitals>,
    complaints: Option<&ComplaintsHistory>,
    complaint_items: &[crate::models::visit::VisitComplaint],
    _ayush: Option<&AyushCaseTaking>,
    diagnoses: &[(String, String, String)],
    prescription: Option<&Prescription>,
    items: &[PrescriptionItem],
    med_map: &HashMap<String, Option<String>>,
) -> String {
    let mut rx_rows = String::new();
    for item in items {
        let source_badge = if item.source_type == "RULE_SUGGESTION" {
            format!("<span style='font-size: 11px; background: #eef8f1; color: #1b4332; padding: 2px 6px; border-radius: 4px;'>Rule v{}</span>", item.rule_version.unwrap_or(1))
        } else {
            "<span style='font-size: 11px; background: #f3f4f6; color: #4b5563; padding: 2px 6px; border-radius: 4px;'>Doctor Added</span>".to_string()
        };

        let bilingual_med = format_bilingual_name(
            &item.medicine_name_snapshot,
            item.medicine_id.as_deref(),
            med_map,
        );

        rx_rows.push_str(&format!(
            "<tr>
                <td style='padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;'>{}<br>{}</td>
                <td style='padding: 8px; border-bottom: 1px solid #e5e7eb;'>{}</td>
                <td style='padding: 8px; border-bottom: 1px solid #e5e7eb;'>{}</td>
                <td style='padding: 8px; border-bottom: 1px solid #e5e7eb;'>{}</td>
                <td style='padding: 8px; border-bottom: 1px solid #e5e7eb;'>{}</td>
            </tr>",
            bilingual_med,
            source_badge,
            item.dosage_text.as_deref().unwrap_or("-"),
            item.frequency_text.as_deref().unwrap_or("-"),
            item.duration_text.as_deref().unwrap_or("-"),
            item.anupana_text.as_deref().unwrap_or("-")
        ));
    }

    let mut diag_html = String::new();
    if diagnoses.is_empty() {
        diag_html.push_str("<em>No diagnosis entered</em>");
    } else {
        for (code, name, notes) in diagnoses {
            diag_html.push_str(&format!("<div><strong style='color: #1b4332;'>[{}] {}</strong>", code, name));
            if !notes.is_empty() {
                diag_html.push_str(&format!(" — <span style='color: #4b5563;'>{}</span>", notes));
            }
            diag_html.push_str("</div>");
        }
    }

    let vitals_summary = match vitals {
        Some(v) => format!(
            "BP: {}/{} mmHg | Pulse: {} bpm | Resp: {} /min | Temp: {} °F | SpO2: {}% | Wt: {} kg | Ht: {} cm",
            v.systolic_bp.unwrap_or(0),
            v.diastolic_bp.unwrap_or(0),
            v.pulse_rate.unwrap_or(0),
            v.respiratory_rate.unwrap_or(0),
            v.temperature.unwrap_or(0.0),
            v.oxygen_saturation.unwrap_or(0.0),
            v.weight_kg.unwrap_or(0.0),
            v.height_cm.unwrap_or(0.0),
        ),
        None => "No vitals recorded".to_string(),
    };

    let chief_complaints_html = if !complaint_items.is_empty() {
        let mut list_html = "<ol style='margin: 4px 0 8px 0; padding-left: 20px; line-height: 1.6;'>".to_string();
        for item in complaint_items {
            let dur_str = match (item.duration_value, &item.duration_unit) {
                (Some(v), Some(u)) => format!(" — <strong>{} {}</strong>", v, u),
                (Some(v), None) => format!(" — <strong>{}</strong>", v),
                _ => String::new(),
            };
            list_html.push_str(&format!("<li>{}{}</li>", item.complaint_text, dur_str));
        }
        list_html.push_str("</ol>");
        list_html
    } else {
        let text = complaints
            .and_then(|c| c.chief_complaint.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("None recorded");
        format!("<div style='margin-top: 4px;'>{}</div>", text)
    };

    let history_text = complaints
        .and_then(|c| c.history_text.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("-");

    let rx_status = prescription
        .map(|p| p.status.as_str())
        .unwrap_or("NOT_PRESCRIBED");

    let visit_date_display = format_display_date(&visit.visit_date);
    let opd_display = match visit.opd_number.as_deref() {
        Some(opd) if !opd.trim().is_empty() && opd != "None" && opd != "null" => opd.to_string(),
        _ => format!("{}/{}", patient.patient_code, visit_date_display),
    };
    let visit_no_display = match visit.patient_visit_seq {
        Some(seq) => format!("{:02}", seq),
        None => {
            let digits: String = visit.visit_number.chars().filter(|c| c.is_ascii_digit()).collect();
            if let Ok(num) = digits.parse::<u32>() {
                format!("{:02}", num)
            } else if !visit.visit_number.trim().is_empty() {
                visit.visit_number.clone()
            } else {
                "01".to_string()
            }
        }
    };
    let dob_display = match format_display_dob(patient.date_of_birth.as_deref()) {
        Some(d) if !d.trim().is_empty() && d != "-" && d != "None" && d != "null" => d,
        _ => "-".to_string(),
    };
    let gender_display = match patient.sex.as_deref() {
        Some(s) if !s.trim().is_empty() && s != "None" && s != "null" => s.to_string(),
        _ => "Unspecified".to_string(),
    };
    let phone_display = match patient.phone.as_deref() {
        Some(p) if !p.trim().is_empty() && p != "None" && p != "null" => p.to_string(),
        _ => "-".to_string(),
    };

    format!(
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Case Sheet - {patient_name} ({patient_code}) - {visit_date}</title>
    <style>
        @page {{ size: A4 portrait; margin: 15mm; }}
        body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 30px; color: #191f1d; font-size: 13px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
        .header {{ border-bottom: 2px solid #1b4332; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }}
        .title {{ font-size: 18px; font-weight: bold; color: #1b4332; letter-spacing: -0.01em; }}
        .dept-subtitle {{ font-size: 12px; color: #2d6a4f; font-weight: 600; margin-top: 2px; }}
        .section-title {{ font-size: 13px; font-weight: 700; color: #1b4332; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 12px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; page-break-inside: avoid; }}
        th {{ background: #f8f9fa !important; text-align: left; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #374151; }}
        td {{ padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }}
        .footer {{ margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; page-break-inside: avoid; }}
        @media print {{
            body {{ margin: 0; padding: 0; }}
            .header {{ margin-bottom: 12px; }}
            .footer {{ margin-top: 24px; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="title">AYURCASE CLINICAL CASE SHEET</div>
            <div class="dept-subtitle">Department: {department}</div>
            <div style="font-size: 11px; color: #4b5563;">Ayurveda Clinical Case Record &amp; Prescription</div>
        </div>
        <div style="text-align: right; font-size: 12px; line-height: 1.6;">
            <div><strong>Patient Code:</strong> <span style="font-family: monospace; font-weight: bold; color: #1b4332;">{patient_code}</span></div>
            <div><strong>OPD No.:</strong> <span style="font-family: monospace; font-weight: bold; color: #1b4332;">{opd_no}</span></div>
            <div><strong>Visit No.:</strong> <span style="font-weight: bold;">{visit_no}</span></div>
            <div><strong>Date:</strong> <span style="font-weight: bold;">{visit_date}</span></div>
            <div><strong>Doctor:</strong> {doctor}</div>
        </div>
    </div>

    <div class="section-title">Patient Profile</div>
    <div class="grid">
        <div><strong>Patient Name:</strong> {patient_name}</div>
        <div><strong>Patient Code:</strong> <span style="font-family: monospace; font-weight: bold; color: #1b4332;">{patient_code}</span></div>
        <div><strong>OPD No.:</strong> <span style="font-family: monospace; font-weight: bold; color: #1b4332;">{opd_no}</span></div>
        <div><strong>Visit No.:</strong> <span style="font-weight: bold;">{visit_no}</span></div>
        <div><strong>Gender:</strong> {gender}</div>
        <div><strong>DOB:</strong> {dob}</div>
        <div><strong>Contact:</strong> {phone}</div>
    </div>

    <div class="section-title">Clinical Vitals</div>
    <div style="background: #f8f9fa; padding: 8px 12px; border-radius: 4px; font-size: 13px;">
        {vitals_summary}
    </div>

    <div class="section-title">Complaints &amp; History</div>
    <div><strong>Chief Complaints (Pradhana Vedana):</strong></div>
    {chief_complaints_html}
    <div style="margin-top: 6px;"><strong>Clinical History:</strong> {history_text}</div>

    <div class="section-title">Doctor's Diagnosis (Manual)</div>
    <div>{diag_html}</div>

    <div class="section-title">Prescription Details (Status: {rx_status})</div>
    <table>
        <thead>
            <tr>
                <th>Medicine (औषध)</th>
                <th>Dosage (मात्रा)</th>
                <th>Frequency (काल)</th>
                <th>Duration (अवधि)</th>
                <th>Anupana (अनुपान)</th>
            </tr>
        </thead>
        <tbody>
            {rx_rows}
        </tbody>
    </table>

    <div class="footer">
        <div>Generated by SIXSENSE Server • AYURCASE Clinical System</div>
        <div>Treating Physician: <strong>{doctor}</strong></div>
    </div>
</body>
</html>"#,
        visit_no = visit_no_display,
        visit_date = visit_date_display,
        doctor = doctor_name,
        department = dept_name,
        patient_name = patient.full_name,
        patient_code = patient.patient_code,
        opd_no = opd_display,
        gender = gender_display,
        dob = dob_display,
        phone = phone_display,
        vitals_summary = vitals_summary,
        chief_complaints_html = chief_complaints_html,
        history_text = history_text,
        diag_html = diag_html,
        rx_status = rx_status,
        rx_rows = if rx_rows.is_empty() { "<tr><td colspan='5' style='padding: 12px; text-align: center; color: #6b7280;'>No medicines prescribed</td></tr>".to_string() } else { rx_rows },
    )
}

fn render_prescription_html(
    visit: &Visit,
    patient: &Patient,
    doctor_name: &str,
    dept_name: &str,
    vitals: Option<&Vitals>,
    complaints: Option<&ComplaintsHistory>,
    complaint_items: &[crate::models::visit::VisitComplaint],
    diagnoses: &[(String, String, String)],
    prescription: Option<&Prescription>,
    items: &[PrescriptionItem],
    med_map: &HashMap<String, Option<String>>,
) -> String {
    let visit_date_display = format_display_date(&visit.visit_date);
    let opd_display = match visit.opd_number.as_deref() {
        Some(opd) if !opd.trim().is_empty() && opd != "None" && opd != "null" => opd.to_string(),
        _ => format!("{}/{}", patient.patient_code, visit_date_display),
    };
    let visit_no_display = match visit.patient_visit_seq {
        Some(seq) => format!("{:02}", seq),
        None => {
            let digits: String = visit.visit_number.chars().filter(|c| c.is_ascii_digit()).collect();
            if let Ok(num) = digits.parse::<u32>() {
                format!("{:02}", num)
            } else if !visit.visit_number.trim().is_empty() {
                visit.visit_number.clone()
            } else {
                "01".to_string()
            }
        }
    };
    let dob_display = match format_display_dob(patient.date_of_birth.as_deref()) {
        Some(d) if !d.trim().is_empty() && d != "-" && d != "None" && d != "null" => d,
        _ => "-".to_string(),
    };
    let gender_display = match patient.sex.as_deref() {
        Some(s) if !s.trim().is_empty() && s != "None" && s != "null" => s.to_string(),
        _ => "Unspecified".to_string(),
    };
    let phone_display = match patient.phone.as_deref() {
        Some(p) if !p.trim().is_empty() && p != "None" && p != "null" => p.to_string(),
        _ => "-".to_string(),
    };
    let clean_doc_name = if doctor_name.to_lowercase().starts_with("dr.") || doctor_name.to_lowercase().starts_with("dr ") {
        doctor_name.to_string()
    } else {
        format!("Dr. {}", doctor_name)
    };

    // 1. Build Formulations Table Rows
    let mut rx_rows = String::new();
    for (idx, item) in items.iter().enumerate() {
        let bilingual_med = format_bilingual_name(
            &item.medicine_name_snapshot,
            item.medicine_id.as_deref(),
            med_map,
        );

        let source_badge = if item.source_type == "CLINICAL_RULE" {
            "<span style='display:inline-block; font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0369a1; padding: 1px 6px; border-radius: 4px; margin-left: 6px;'>Clinical Protocol</span>"
        } else {
            "<span style='display:inline-block; font-size: 10px; font-weight: 600; background: #f3f4f6; color: #4b5563; padding: 1px 6px; border-radius: 4px; margin-left: 6px;'>Physician Prescribed</span>"
        };

        let pathya_callout = match (&item.pathya_text, &item.apathya_text) {
            (Some(p), Some(a)) => format!(
                "<div style='margin-top: 5px; display: flex; gap: 6px; flex-wrap: wrap;'>
                    <span style='font-size: 10.5px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 7px; border-radius: 4px;'><strong>✓ Pathya:</strong> {}</span>
                    <span style='font-size: 10.5px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 2px 7px; border-radius: 4px;'><strong>✗ Apathya:</strong> {}</span>
                </div>",
                p, a
            ),
            (Some(p), None) => format!(
                "<div style='margin-top: 5px;'>
                    <span style='font-size: 10.5px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 7px; border-radius: 4px;'><strong>✓ Pathya:</strong> {}</span>
                </div>",
                p
            ),
            (None, Some(a)) => format!(
                "<div style='margin-top: 5px;'>
                    <span style='font-size: 10.5px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 2px 7px; border-radius: 4px;'><strong>✗ Apathya:</strong> {}</span>
                </div>",
                a
            ),
            (None, None) => String::new(),
        };

        rx_rows.push_str(&format!(
            "<tr style='background: {bg};'>
                <td style='padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #475569;'>{num}</td>
                <td style='padding: 10px 10px; border-bottom: 1px solid #e2e8f0;'>
                    <div style='font-weight: 700; color: #1b4332; font-size: 13.5px; display: flex; align-items: center;'>
                        <span>{med}</span>
                        {badge}
                    </div>
                    {pathya}
                </td>
                <td style='padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;'>{dose}</td>
                <td style='padding: 10px 8px; border-bottom: 1px solid #e2e8f0;'>
                    <span style='display: inline-block; background: #f0fdf4; color: #166534; font-weight: 600; border: 1px solid #bbf7d0; padding: 2px 8px; border-radius: 4px; font-size: 11.5px;'>{freq}</span>
                </td>
                <td style='padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #334155;'>{dur}</td>
                <td style='padding: 10px 8px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 12px;'>{anupana}</td>
            </tr>",
            bg = if idx % 2 == 1 { "#fbfcfd" } else { "#ffffff" },
            num = idx + 1,
            med = bilingual_med,
            badge = source_badge,
            pathya = pathya_callout,
            dose = item.dosage_text.as_deref().unwrap_or("-"),
            freq = item.frequency_text.as_deref().unwrap_or("-"),
            dur = item.duration_text.as_deref().unwrap_or("-"),
            anupana = item.anupana_text.as_deref().unwrap_or("-")
        ));
    }

    if rx_rows.is_empty() {
        rx_rows = "<tr><td colspan='6' style='padding: 24px; text-align: center; color: #94a3b8; font-style: italic;'>No medicines prescribed for this consultation</td></tr>".to_string();
    }

    // 2. Vitals Strip Badges
    let vitals_html = match vitals {
        Some(v) => {
            let mut badges = Vec::new();
            if let (Some(sbp), Some(dbp)) = (v.systolic_bp, v.diastolic_bp) {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>BP</span><span class='vital-val'>{}/{}</span><span class='vital-unit'>mmHg</span></div>", sbp, dbp));
            }
            if let Some(pulse) = v.pulse_rate {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>Pulse</span><span class='vital-val'>{}</span><span class='vital-unit'>bpm</span></div>", pulse));
            }
            if let Some(resp) = v.respiratory_rate {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>Resp</span><span class='vital-val'>{}</span><span class='vital-unit'>/min</span></div>", resp));
            }
            if let Some(temp) = v.temperature {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>Temp</span><span class='vital-val'>{:.1}</span><span class='vital-unit'>°F</span></div>", temp));
            }
            if let Some(spo2) = v.oxygen_saturation {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>SpO₂</span><span class='vital-val'>{:.0}</span><span class='vital-unit'>%</span></div>", spo2));
            }
            if let Some(wt) = v.weight_kg {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>Weight</span><span class='vital-val'>{:.1}</span><span class='vital-unit'>kg</span></div>", wt));
            }
            if let Some(ht) = v.height_cm {
                badges.push(format!("<div class='vital-card'><span class='vital-lbl'>Height</span><span class='vital-val'>{:.0}</span><span class='vital-unit'>cm</span></div>", ht));
            }
            if let (Some(w), Some(h)) = (v.weight_kg, v.height_cm) {
                if h > 0.0 {
                    let bmi = w / ((h / 100.0) * (h / 100.0));
                    badges.push(format!("<div class='vital-card'><span class='vital-lbl'>BMI</span><span class='vital-val'>{:.1}</span><span class='vital-unit'>kg/m²</span></div>", bmi));
                }
            }
            if badges.is_empty() {
                "<div style='color: #64748b; font-size: 12px; font-style: italic;'>No quantitative vitals entered</div>".to_string()
            } else {
                format!("<div class='vitals-flex'>{}</div>", badges.join(""))
            }
        }
        None => "<div style='color: #64748b; font-size: 12px; font-style: italic;'>No vitals recorded for this visit</div>".to_string(),
    };

    // 3. Chief Complaints (Pradhana Vedana)
    let complaints_html = if !complaint_items.is_empty() {
        let items_str: Vec<String> = complaint_items.iter().enumerate().map(|(i, item)| {
            let dur = match (item.duration_value, &item.duration_unit) {
                (Some(val), Some(unit)) => format!(" <span style='font-size: 11px; background: #f1f5f9; color: #334155; padding: 1px 6px; border-radius: 4px; font-weight: 600;'>{} {}</span>", val, unit),
                (Some(val), None) => format!(" <span style='font-size: 11px; background: #f1f5f9; color: #334155; padding: 1px 6px; border-radius: 4px; font-weight: 600;'>{}</span>", val),
                _ => String::new(),
            };
            format!("<div style='margin-bottom: 3px;'><strong>{}.</strong> {}{}</div>", i + 1, item.complaint_text, dur)
        }).collect();
        items_str.join("")
    } else if let Some(ref c) = complaints {
        if let Some(ref cc) = c.chief_complaint {
            format!("<div>{}</div>", cc)
        } else {
            "<span style='color: #94a3b8; font-style: italic;'>None recorded</span>".to_string()
        }
    } else {
        "<span style='color: #94a3b8; font-style: italic;'>None recorded</span>".to_string()
    };

    // 4. Clinical Diagnoses (Rog Nidan)
    let diagnoses_html = if !diagnoses.is_empty() {
        let diag_str: Vec<String> = diagnoses.iter().map(|(code, name, notes)| {
            let notes_str = if !notes.is_empty() {
                format!(" <span style='color: #64748b; font-size: 11.5px;'>— {}</span>", notes)
            } else {
                String::new()
            };
            format!(
                "<div style='margin-bottom: 4px;'>
                    <span style='background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; font-weight: 700; font-family: monospace; padding: 1px 6px; border-radius: 4px; font-size: 11px;'>{}</span>
                    <strong style='color: #1b4332; margin-left: 6px;'>{}</strong>{}
                </div>",
                code, name, notes_str
            )
        }).collect();
        diag_str.join("")
    } else {
        "<span style='color: #94a3b8; font-style: italic;'>Ayurvedic Clinical Assessment / Prophylaxis</span>".to_string()
    };

    let rx_status = prescription
        .map(|p| p.status.as_str())
        .unwrap_or("DRAFT");

    let status_color = if rx_status == "FINALIZED" {
        "background: #dcfce7; color: #15803d; border-color: #86efac;"
    } else {
        "background: #fef3c7; color: #b45309; border-color: #fde68a;"
    };

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Prescription - {patient_name} ({patient_code}) - {visit_date}</title>
    <style>
        @page {{
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
        }}
        * {{
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            font-size: 12.5px;
            line-height: 1.45;
            margin: 0;
            padding: 16px;
        }}
        .hospital-header {{
            border-bottom: 3px double #1b4332;
            padding-bottom: 12px;
            margin-bottom: 14px;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
        }}
        .logo-box {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .hospital-name {{
            font-size: 20px;
            font-weight: 800;
            color: #1b4332;
            letter-spacing: -0.02em;
            line-height: 1.2;
        }}
        .hospital-motto {{
            font-size: 11.5px;
            font-style: italic;
            color: #2d6a4f;
            font-weight: 600;
            margin-top: 3px;
        }}
        .hospital-sub {{
            font-size: 10.5px;
            color: #64748b;
            margin-top: 2px;
        }}
        .header-meta {{
            text-align: right;
            min-width: 220px;
        }}
        .doc-title-badge {{
            display: inline-block;
            background: #1b4332;
            color: #ffffff;
            padding: 3px 10px;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 6px;
        }}
        .status-pill {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            border: 1px solid transparent;
        }}
        .patient-card {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }}
        .patient-grid {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px 14px;
            font-size: 12px;
        }}
        .patient-label {{
            font-size: 10.5px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            margin-bottom: 1px;
        }}
        .patient-value {{
            font-weight: 600;
            color: #0f172a;
        }}
        .code-pill {{
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            background: #e2e8f0;
            color: #0f172a;
            padding: 1px 5px;
            border-radius: 3px;
            font-weight: 700;
        }}
        .section-container {{
            margin-bottom: 12px;
        }}
        .section-header {{
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11.5px;
            font-weight: 700;
            color: #1b4332;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            border-bottom: 1.5px solid #cbd5e1;
            padding-bottom: 3px;
            margin-bottom: 6px;
        }}
        .vitals-flex {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}
        .vital-card {{
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 3px 8px;
            display: flex;
            align-items: baseline;
            gap: 4px;
        }}
        .vital-lbl {{
            font-size: 10px;
            color: #64748b;
            font-weight: 700;
            text-transform: uppercase;
        }}
        .vital-val {{
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
        }}
        .vital-unit {{
            font-size: 10px;
            color: #64748b;
        }}
        .clinical-split {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
        }}
        .clinical-box {{
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 12px;
        }}
        .rx-banner {{
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-top: 14px;
            margin-bottom: 6px;
        }}
        .rx-emblem {{
            font-size: 30px;
            font-family: "Times New Roman", Times, serif;
            font-weight: bold;
            color: #1b4332;
            line-height: 1;
        }}
        .rx-instructions-note {{
            font-size: 11px;
            color: #64748b;
            font-style: italic;
        }}
        table.rx-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 12px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            overflow: hidden;
        }}
        table.rx-table th {{
            background: #1b4332 !important;
            color: #ffffff !important;
            text-align: left;
            padding: 8px 8px;
            font-weight: 700;
            font-size: 11.5px;
            letter-spacing: 0.02em;
        }}
        .advice-card {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 3px solid #1b4332;
            border-radius: 4px;
            padding: 8px 12px;
            margin-bottom: 16px;
            font-size: 11.5px;
            color: #334155;
        }}
        .signoff-section {{
            margin-top: 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            page-break-inside: avoid;
            padding-top: 10px;
        }}
        .hospital-seal-wrap {{
            display: flex;
            align-items: center;
            gap: 14px;
        }}
        .stamp-box {{
            width: 80px;
            height: 80px;
        }}
        .legal-notice {{
            font-size: 10px;
            color: #64748b;
            max-width: 320px;
            line-height: 1.4;
        }}
        .doc-signature-box {{
            text-align: center;
            min-width: 220px;
        }}
        .sig-line {{
            border-top: 1.5px solid #1e293b;
            padding-top: 6px;
            font-size: 13px;
            font-weight: 700;
            color: #1b4332;
        }}
        .sig-sub {{
            font-size: 10.5px;
            color: #64748b;
            line-height: 1.3;
        }}
        .page-footer {{
            margin-top: 14px;
            border-top: 1px solid #e2e8f0;
            padding-top: 6px;
            font-size: 9.5px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
        }}
        @media print {{
            body {{
                padding: 0;
                background: transparent;
            }}
            .rx-table {{
                page-break-inside: auto;
            }}
            tr {{
                page-break-inside: avoid;
                page-break-after: auto;
            }}
            .signoff-section {{
                page-break-inside: avoid;
            }}
        }}
    </style>
</head>
<body>

    <!-- Hospital Letterhead Header -->
    <div class="hospital-header">
        <div class="logo-box">
            <div>
                <div class="hospital-name">AYURCASE AYURVEDIC HOSPITAL &amp; RESEARCH INSTITUTE</div>
                <div class="hospital-motto">“स्वस्थस्य स्वास्थ्य रक्षणं आतुरस्य विकार प्रशमनं च”</div>
                <div class="hospital-sub">NABH Accredited Ayush Healthcare Center • Central Research Directorate</div>
                <div class="hospital-sub" style="font-size: 10px; color: #475569; margin-top: 1px;">
                    Department of <strong>{department}</strong> • Helpline: 1800-AYUR-CARE • info@ayurcase.gov.in
                </div>
            </div>
        </div>
        <div class="header-meta">
            <div><span class="doc-title-badge">Outpatient Prescription</span></div>
            <div>
                <span class="status-pill" style="{status_color}">STATUS: {rx_status}</span>
            </div>
            <div style="font-size: 11.5px; color: #334155; margin-top: 4px;">
                <strong>Date:</strong> {visit_date}
            </div>
            <div style="font-size: 11px; color: #64748b;">
                <strong>Visit No.:</strong> {visit_no}
            </div>
            <div style="font-size: 11px; color: #64748b;">
                <strong>OPD No.:</strong> {opd_no}
            </div>
        </div>
    </div>

    <!-- Patient Demographics Card -->
    <div class="patient-card">
        <div class="patient-grid">
            <div>
                <div class="patient-label">Patient Name</div>
                <div class="patient-value" style="font-size: 13.5px; color: #1b4332;">{patient_name}</div>
            </div>
            <div>
                <div class="patient-label">Patient Code</div>
                <div class="patient-value"><span class="code-pill">{patient_code}</span></div>
            </div>
            <div>
                <div class="patient-label">OPD No.</div>
                <div class="patient-value"><span class="code-pill">{opd_no}</span></div>
            </div>
            <div>
                <div class="patient-label">Visit No.</div>
                <div class="patient-value"><span class="code-pill">{visit_no}</span></div>
            </div>
            <div>
                <div class="patient-label">Gender</div>
                <div class="patient-value">{gender}</div>
            </div>
            <div>
                <div class="patient-label">DOB</div>
                <div class="patient-value">{dob}</div>
            </div>
            <div>
                <div class="patient-label">Contact</div>
                <div class="patient-value">{phone}</div>
            </div>
            <div>
                <div class="patient-label">Treating Physician</div>
                <div class="patient-value" style="color: #1b4332;">{doctor}</div>
            </div>
        </div>
    </div>

    <!-- Clinical Vitals Strip -->
    <div class="section-container">
        <div class="section-header">Physical Vitals &amp; Anthropometry (शारीरिक लक्षण)</div>
        {vitals_html}
    </div>

    <!-- Complaints & Diagnosis Split -->
    <div class="clinical-split">
        <div class="clinical-box">
            <div class="section-header" style="border-bottom-color: #e2e8f0; margin-bottom: 4px;">Chief Complaints (प्रधान वेदना)</div>
            <div style="font-size: 12px; color: #1e293b;">
                {complaints_html}
            </div>
        </div>
        <div class="clinical-box">
            <div class="section-header" style="border-bottom-color: #e2e8f0; margin-bottom: 4px;">Clinical Diagnosis (रोग निदान)</div>
            <div style="font-size: 12px;">
                {diagnoses_html}
            </div>
        </div>
    </div>

    <!-- Classical ℞ Symbol & Header -->
    <div class="rx-banner">
        <div style="display: flex; align-items: baseline; gap: 8px;">
            <span class="rx-emblem">&#8478;</span>
            <span style="font-size: 13px; font-weight: 700; color: #1b4332; text-transform: uppercase; letter-spacing: 0.05em;">Prescribed Formulations (औषध योग)</span>
        </div>
        <div class="rx-instructions-note">
            Take strictly as per schedule and vehicle (अनुपान) specified
        </div>
    </div>

    <!-- Formulations Table -->
    <table class="rx-table">
        <thead>
            <tr>
                <th style="width: 32px; text-align: center;">#</th>
                <th style="width: 35%;">Formulation (औषध)</th>
                <th style="width: 14%;">Dosage (मात्रा)</th>
                <th style="width: 18%;">Frequency (काल)</th>
                <th style="width: 13%;">Duration (अवधि)</th>
                <th style="width: 20%;">Anupana (अनुपान)</th>
            </tr>
        </thead>
        <tbody>
            {rx_rows}
        </tbody>
    </table>

    <!-- Pathyapathya & Lifestyle Guidelines -->
    <div class="advice-card">
        <div style="font-weight: 700; color: #1b4332; margin-bottom: 4px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.03em;">
            General Dietary &amp; Lifestyle Regimen (सामान्य पथ्यापथ्य निर्देश)
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11.5px; line-height: 1.4;">
            <div>
                <strong style="color: #166534;">✓ Pathya (Recommended):</strong> Warm, freshly cooked, light food (Laghu Ahara), lukewarm water (Ushnodaka), adequate rest and seasonal regimen (Ritucharya).
            </div>
            <div>
                <strong style="color: #991b1b;">✗ Apathya (Strictly Avoid):</strong> Deep fried, stale, heavy or sour foods (Guru &amp; Abhishyandi), chilled beverages, irregular sleep (Ratri Jagarana), day sleeping (Diva Swapna).
            </div>
        </div>
        <div style="margin-top: 6px; font-weight: 600; color: #2d6a4f; font-size: 11px;">
            पुनरागमन (Follow-Up): Review after completion of medication course or within 14 days, or immediately in case of symptom exacerbation.
        </div>
    </div>

    <!-- Hospital Verification Seal & Doctor Sign-Off -->
    <div class="signoff-section">
        <div class="hospital-seal-wrap">
            <div class="stamp-box">
                <svg width="80" height="80" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#1b4332" stroke-width="2" stroke-dasharray="3,3" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1b4332" stroke-width="1.5" />
                    <path id="curve-top" d="M 15 50 A 35 35 0 0 1 85 50" fill="none" />
                    <path id="curve-bot" d="M 85 50 A 35 35 0 0 1 15 50" fill="none" />
                    <text font-size="6.8" font-weight="bold" fill="#1b4332" letter-spacing="1.2">
                        <textPath href="#curve-top" startOffset="50%" text-anchor="middle">AYURCASE HOSPITAL</textPath>
                    </text>
                    <text font-size="6.2" font-weight="bold" fill="#1b4332" letter-spacing="1.1">
                        <textPath href="#curve-bot" startOffset="50%" text-anchor="middle">OFFICIALLY VERIFIED</textPath>
                    </text>
                    <circle cx="50" cy="50" r="18" fill="#f0fdf4" stroke="#2d6a4f" stroke-width="1" />
                    <text x="50" y="48" font-size="10" font-weight="bold" fill="#1b4332" text-anchor="middle">AYUSH</text>
                    <text x="50" y="58" font-size="7" font-weight="bold" fill="#2d6a4f" text-anchor="middle">OPD</text>
                </svg>
            </div>
            <div class="legal-notice">
                <div>• Electronic Clinical Record under AYURCASE EHR Core Engine.</div>
                <div>• Prescriptions are valid only when verified by an authorized Ayurvedic physician.</div>
                <div>• Store medicines away from direct sunlight in a cool, dry place.</div>
            </div>
        </div>

        <div class="doc-signature-box">
            <div style="height: 38px;"></div>
            <div class="sig-line">{doctor}</div>
            <div class="sig-sub">B.A.M.S, M.D. (Ayurveda)</div>
            <div class="sig-sub">Department of {department}</div>
            <div class="sig-sub" style="font-weight: 600; color: #1b4332; margin-top: 1px;">Treating Ayurvedic Consultant</div>
        </div>
    </div>

    <!-- Document Verification Footer -->
    <div class="page-footer">
        <div>AYURCASE Clinical OS • Hospital Information System</div>
        <div>Patient Code: {patient_code} • OPD No.: {opd_no} • Visit No.: {visit_no}</div>
        <div>Date: {visit_date}</div>
    </div>

</body>
</html>"##,
        patient_name = patient.full_name,
        patient_code = patient.patient_code,
        opd_no = opd_display,
        visit_date = visit_date_display,
        visit_no = visit_no_display,
        department = dept_name,
        doctor = clean_doc_name,
        rx_status = rx_status,
        status_color = status_color,
        gender = gender_display,
        dob = dob_display,
        phone = phone_display,
        vitals_html = vitals_html,
        complaints_html = complaints_html,
        diagnoses_html = diagnoses_html,
        rx_rows = rx_rows,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_minimal_pdf_structure() {
        let lines = vec![
            "Department: SIXSENSE".to_string(),
            "Treating Physician: Dr. Sharmin Pathan, BAMS MD".to_string(),
            "Date: 17/09/2026".to_string(),
            "--------------------------------------------------------------------------------".to_string(),
            "PATIENT IDENTIFICATION:".to_string(),
            "  Patient Name: rudra".to_string(),
            "  Patient Code: 0003".to_string(),
            "  OPD No.:      0003/17/09/2026".to_string(),
            "  Visit No.:    01".to_string(),
            "  Gender / DOB: Male / 17/09/1999".to_string(),
            "  Contact:      1111111111".to_string(),
            "--------------------------------------------------------------------------------".to_string(),
            "CLINICAL VITALS:".to_string(),
            "  BP: 120/80 mmHg | Pulse: 72 bpm | Resp: 16 /min".to_string(),
            "  Temp: 98.4 F | SpO2: 98% | Wt: 68 kg | Ht: 170 cm".to_string(),
            "--------------------------------------------------------------------------------".to_string(),
            "CHIEF COMPLAINTS (PRADHANA VEDANA):".to_string(),
            "  1. Kasa (Cough) (Duration: 3 Days)".to_string(),
            "  2. Twak Vikara (Skin Eruptions) (Duration: 3 Months)".to_string(),
            "  3. Katishoola (Low Back Pain) (Duration: 3 Weeks)".to_string(),
            "Clinical History: late night sleep due to low back girls".to_string(),
            "--------------------------------------------------------------------------------".to_string(),
            "DOCTOR DIAGNOSIS (MANUAL):".to_string(),
            "  [AND-25] Anidra (Insomnia)".to_string(),
            "--------------------------------------------------------------------------------".to_string(),
            "PRESCRIPTION (Status: FINALIZED):".to_string(),
            "  1. Ashwagandha Churna | Dose: 3g to 5g | Freq: at bedtime | Dur: Bedtime sedative nourishment | Anupana: Warm sweetened cow's milk".to_string(),
            "  2. AYUSH-82 + purified Shilajit | Dose: AYUSH-82 5 g + Shilajit 500 mg | Freq: three times daily | Dur: Early-stage diabetes / pre-diabetes context | Anupana: Not specified in source".to_string(),
            "--------------------------------------------------------------------------------".to_string(),
            "Treating Physician Signature: Dr. Sharmin Pathan, BAMS MD".to_string(),
            "SIXSENSE Server - AYURCASE Clinical Record System".to_string(),
        ];
        let pdf = generate_minimal_pdf("AYURCASE CASE SHEET — Visit No.01 | OPD: 0003/17/09/2026 | Patient: 0003", &lines);
        assert!(pdf.starts_with(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
        assert!(pdf.ends_with(b"%%EOF\n"));
        let pdf_str = String::from_utf8_lossy(&pdf);
        assert!(pdf_str.contains("/Type /Catalog"));
        assert!(pdf_str.contains("/Type /Pages"));
        assert!(pdf_str.contains("AYUSH-82"));
        let _ = std::fs::write("/tmp/wrapped_test.pdf", &pdf);
    }
}

