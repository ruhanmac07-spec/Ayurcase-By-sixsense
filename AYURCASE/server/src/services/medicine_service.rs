use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::medicine::{
    ClinicalReference, CsvCommitRequest, CsvCommitResponse, CsvPreviewResponse,
    CsvValidationIssue, Medicine, MedicineSearchResult,
};
use crate::repositories::DbPool;
use chrono::Utc;
use std::collections::HashSet;
use uuid::Uuid;

pub struct MedicineService;

impl MedicineService {
    /// High-performance clinical medicine search for doctors and authority
    pub async fn search_medicines(
        pool: &DbPool,
        query: Option<&str>,
        limit: i64,
    ) -> Result<Vec<MedicineSearchResult>, AppError> {
        let q_clean = query.unwrap_or("").trim();
        let limit = if limit <= 0 || limit > 100 { 25 } else { limit };

        let medicines: Vec<Medicine> = if q_clean.is_empty() {
            sqlx::query_as(
                "SELECT id, code, name, name_hi, english_name, sanskrit_name, form, strength,
                        source, source_reference, validation_status, notes, description,
                        status, created_at, updated_at
                 FROM medicines
                 WHERE status = 'ACTIVE'
                 ORDER BY name ASC
                 LIMIT ?",
            )
            .bind(limit)
            .fetch_all(pool)
            .await?
        } else {
            let pattern = format!("%{}%", q_clean);
            let prefix = format!("{}%", q_clean);
            sqlx::query_as(
                "SELECT id, code, name, name_hi, english_name, sanskrit_name, form, strength,
                        source, source_reference, validation_status, notes, description,
                        status, created_at, updated_at
                 FROM medicines
                 WHERE status = 'ACTIVE'
                   AND (
                       name LIKE ? OR
                       name_hi LIKE ? OR
                       sanskrit_name LIKE ? OR
                       english_name LIKE ? OR
                       code LIKE ?
                   )
                 ORDER BY
                   CASE WHEN LOWER(name) = LOWER(?) THEN 0
                        WHEN LOWER(name) LIKE LOWER(?) THEN 1
                        ELSE 2 END,
                   name ASC
                 LIMIT ?",
            )
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .bind(q_clean)
            .bind(&prefix)
            .bind(limit)
            .fetch_all(pool)
            .await?
        };

        // Fetch attached clinical references for each search result
        let mut results = Vec::with_capacity(medicines.len());
        for m in medicines {
            let refs: Vec<ClinicalReference> = sqlx::query_as(
                "SELECT id, medicine_id, diagnosis_id, chief_complaint, duration_context,
                        roga_name, namc_code, formulation_form, dose, frequency, anupana,
                        source, source_reference, source_page, validation_status,
                        dataset_version, imported_at, conflict_note
                 FROM clinical_references
                 WHERE medicine_id = ?
                 ORDER BY validation_status ASC, imported_at DESC",
            )
            .bind(&m.id)
            .fetch_all(pool)
            .await?;

            results.push(MedicineSearchResult {
                id: m.id,
                code: m.code,
                name: m.name,
                name_hi: m.name_hi,
                english_name: m.english_name,
                sanskrit_name: m.sanskrit_name,
                form: m.form,
                strength: m.strength,
                status: m.status,
                references: refs,
            });
        }

        Ok(results)
    }

    /// Retrieve clinical references for a specific medicine
    pub async fn get_references_for_medicine(
        pool: &DbPool,
        medicine_id: &str,
    ) -> Result<Vec<ClinicalReference>, AppError> {
        let refs: Vec<ClinicalReference> = sqlx::query_as(
            "SELECT id, medicine_id, diagnosis_id, chief_complaint, duration_context,
                    roga_name, namc_code, formulation_form, dose, frequency, anupana,
                    source, source_reference, source_page, validation_status,
                    dataset_version, imported_at, conflict_note
             FROM clinical_references
             WHERE medicine_id = ?
             ORDER BY validation_status ASC, imported_at DESC",
        )
        .bind(medicine_id)
        .fetch_all(pool)
        .await?;

        Ok(refs)
    }

    /// Generate clean CSV Template
    pub fn generate_csv_template(template_type: &str) -> (String, String) {
        if template_type.eq_ignore_ascii_case("clinical_reference") {
            let filename = "AYURCASE_Clinical_References_Template.csv".to_string();
            let mut wtr = csv::WriterBuilder::new().from_writer(vec![]);
            wtr.write_record(&[
                "Chief Complaint",
                "Duration",
                "Roga Name",
                "NAMC Code",
                "Medicine Name",
                "Formulation / Form",
                "Dose",
                "Frequency / Timing",
                "Anupana",
                "Duration / Context",
                "Source",
                "Validation Status",
            ])
            .unwrap();
            wtr.write_record(&[
                "Dry, irritating paroxysmal cough, chest tightness",
                "3 Days",
                "Vataja Kasa (Dry Cough)",
                "VKS-15",
                "Sitopaladi Churna",
                "Churna",
                "3g",
                "three to four times daily",
                "Madhu (Honey) and Cow's Ghee",
                "Acute dry cough phase",
                "BAMS Clinical Protocol Reference (NAMC Standard)",
                "VALIDATED",
            ])
            .unwrap();
            wtr.write_record(&[
                "Chronic loose stools, abdominal discomfort",
                "4 Weeks",
                "Grahani Roga",
                "GRH-03",
                "Kutajghan Vati",
                "Vati",
                "2 tablets",
                "twice daily post food",
                "Takra (Fresh buttermilk)",
                "Malabsorption protocol",
                "CCRAS Evidence Based Practice",
                "DOCTOR REVIEW",
            ])
            .unwrap();
            let content = String::from_utf8(wtr.into_inner().unwrap()).unwrap();
            (filename, content)
        } else {
            let filename = "AYURCASE_Medicine_Master_Template.csv".to_string();
            let mut wtr = csv::WriterBuilder::new().from_writer(vec![]);
            wtr.write_record(&[
                "Medicine Name",
                "Formulation / Form",
                "Strength",
                "English Name",
                "Hindi Name",
                "Classical / Sanskrit Name",
                "Source",
                "Source Reference",
                "Validation Status",
                "Notes",
            ])
            .unwrap();
            wtr.write_record(&[
                "Sitopaladi Churna",
                "Churna",
                "50g",
                "Sitopaladi Powder",
                "सीतोपलादि चूर्ण",
                "Sitopaladi Churna",
                "Ayurvedic Pharmacopoeia of India (API)",
                "Part I, Vol II, p. 112",
                "ACTIVE",
                "Classical bronchial soothing formulation",
            ])
            .unwrap();
            wtr.write_record(&[
                "Yogaraja Guggulu",
                "Vati",
                "500mg",
                "Yograj Guggulu Tablet",
                "योगराज गुग्गुलु",
                "Yogaraja Guggulu",
                "Bhaishajya Ratnavali",
                "Vataroga Chikitsa, 89",
                "ACTIVE",
                "Musculoskeletal and joint health",
            ])
            .unwrap();
            let content = String::from_utf8(wtr.into_inner().unwrap()).unwrap();
            (filename, content)
        }
    }

    /// Validate and preview CSV upload without committing to database
    pub async fn validate_and_preview_csv(
        pool: &DbPool,
        csv_content: &str,
        explicit_type: Option<&str>,
    ) -> Result<CsvPreviewResponse, AppError> {
        let clean_csv = csv_content.trim();
        if clean_csv.is_empty() {
            return Ok(CsvPreviewResponse {
                csv_type: "UNKNOWN".to_string(),
                rows_detected: 0,
                new_medicines: 0,
                existing_medicines: 0,
                duplicate_rows: 0,
                conflicts: 0,
                warnings: vec![],
                errors: vec![CsvValidationIssue {
                    row_index: 0,
                    field: None,
                    message: "The uploaded CSV file is completely empty.".to_string(),
                }],
                can_commit: false,
                preview_rows: vec![],
            });
        }

        let mut rdr = csv::ReaderBuilder::new()
            .trim(csv::Trim::All)
            .flexible(true)
            .from_reader(clean_csv.as_bytes());

        let headers = match rdr.headers() {
            Ok(h) => h.clone(),
            Err(e) => {
                return Ok(CsvPreviewResponse {
                    csv_type: "MALFORMED".to_string(),
                    rows_detected: 0,
                    new_medicines: 0,
                    existing_medicines: 0,
                    duplicate_rows: 0,
                    conflicts: 0,
                    warnings: vec![],
                    errors: vec![CsvValidationIssue {
                        row_index: 1,
                        field: None,
                        message: format!("Malformed CSV headers: {}", e),
                    }],
                    can_commit: false,
                    preview_rows: vec![],
                });
            }
        };

        // Determine CSV type
        let is_clinical_ref = headers.iter().any(|h| {
            let lh = h.to_lowercase();
            lh.contains("chief complaint") || lh.contains("roga") || lh.contains("namc")
        }) || explicit_type.map_or(false, |t| t.eq_ignore_ascii_case("clinical_reference"));

        let csv_type = if is_clinical_ref {
            "CLINICAL_REFERENCE".to_string()
        } else {
            "MEDICINE_MASTER".to_string()
        };

        let mut rows_detected = 0;
        let mut duplicate_rows = 0;
        let mut conflicts = 0;
        let mut warnings = Vec::new();
        let mut errors = Vec::new();
        let mut preview_rows = Vec::new();

        let mut seen_entries = HashSet::new();
        let mut unique_medicines_in_csv = HashSet::new();

        // Load existing medicine names from DB for fast lookup
        let existing_db_meds: Vec<(String, String)> =
            sqlx::query_as("SELECT id, LOWER(name) FROM medicines")
                .fetch_all(pool)
                .await?;
        let existing_med_map: std::collections::HashMap<String, String> =
            existing_db_meds.into_iter().map(|(id, name)| (name, id)).collect();

        // Load existing clinical references for conflict detection
        let existing_refs: Vec<(String, String, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT LOWER(m.name), LOWER(COALESCE(cr.roga_name, '')), cr.dose, cr.anupana
             FROM clinical_references cr
             JOIN medicines m ON m.id = cr.medicine_id",
        )
        .fetch_all(pool)
        .await?;

        for (idx, result) in rdr.records().enumerate() {
            let row_idx = idx + 2; // 1-based index including header
            let record = match result {
                Ok(r) => r,
                Err(e) => {
                    errors.push(CsvValidationIssue {
                        row_index: row_idx,
                        field: None,
                        message: format!("CSV parsing error: {}", e),
                    });
                    continue;
                }
            };

            if record.is_empty() || record.iter().all(|f| f.trim().is_empty()) {
                continue; // ignore empty blank lines
            }

            rows_detected += 1;

            if csv_type == "CLINICAL_REFERENCE" {
                let complaint = get_field(&headers, &record, &["chief complaint", "complaint"]);
                let roga = get_field(&headers, &record, &["roga name", "roga", "diagnosis"]);
                let namc = get_field(&headers, &record, &["namc code", "namc"]);
                let med_name = get_field(&headers, &record, &["medicine name", "medicine"]);
                let form = get_field(&headers, &record, &["formulation / form", "form", "formulation"]);
                let dose = get_field(&headers, &record, &["dose", "dosage"]);
                let freq = get_field(&headers, &record, &["frequency / timing", "frequency", "timing"]);
                let anupana = get_field(&headers, &record, &["anupana", "vehicle"]);
                let duration_ctx = get_field(&headers, &record, &["duration / context", "duration"]);
                let source = get_field(&headers, &record, &["source"]);
                let status = get_field(&headers, &record, &["validation status", "status"])
                    .unwrap_or_else(|| "REFERENCE".to_string());

                if med_name.is_none() || med_name.as_ref().unwrap().is_empty() {
                    errors.push(CsvValidationIssue {
                        row_index: row_idx,
                        field: Some("Medicine Name".to_string()),
                        message: "Medicine name is required.".to_string(),
                    });
                    continue;
                }

                let m_name = med_name.unwrap();
                unique_medicines_in_csv.insert(m_name.to_lowercase());

                if source.is_none() || source.as_ref().unwrap().is_empty() {
                    warnings.push(CsvValidationIssue {
                        row_index: row_idx,
                        field: Some("Source".to_string()),
                        message: "Source is missing; defaulting to 'Authority CSV Import'.".to_string(),
                    });
                }

                // Check exact duplicate in this CSV batch
                let dedup_key = format!(
                    "{}:{}:{}:{}",
                    m_name.to_lowercase(),
                    roga.as_deref().unwrap_or("").to_lowercase(),
                    dose.as_deref().unwrap_or(""),
                    anupana.as_deref().unwrap_or("")
                );
                if seen_entries.contains(&dedup_key) {
                    duplicate_rows += 1;
                    warnings.push(CsvValidationIssue {
                        row_index: row_idx,
                        field: None,
                        message: format!("Duplicate clinical reference row in CSV for '{}'. Action: SKIP.", m_name),
                    });
                } else {
                    seen_entries.insert(dedup_key);
                }

                // Check conflict against existing clinical references in DB
                let m_low = m_name.to_lowercase();
                let r_low = roga.as_deref().unwrap_or("").to_lowercase();
                for (ex_med, ex_roga, ex_dose, ex_anupana) in &existing_refs {
                    if ex_med == &m_low && ex_roga == &r_low {
                        let dose_diff = dose.as_deref().map(|d| d.trim()) != ex_dose.as_deref().map(|d| d.trim());
                        let anup_diff = anupana.as_deref().map(|a| a.trim()) != ex_anupana.as_deref().map(|a| a.trim());
                        if dose_diff || anup_diff {
                            conflicts += 1;
                            warnings.push(CsvValidationIssue {
                                row_index: row_idx,
                                field: Some("Clinical Reference".to_string()),
                                message: format!(
                                    "Clinical Reference Conflict for '{}' under '{}': Existing dose/anupana differs from imported. Preserved with status 'REQUIRES REVIEW'.",
                                    m_name, ex_roga
                                ),
                            });
                            break;
                        }
                    }
                }

                if preview_rows.len() < 10 {
                    preview_rows.push(serde_json::json!({
                        "row": row_idx,
                        "medicine": m_name,
                        "form": form,
                        "roga": roga,
                        "namc": namc,
                        "complaint": complaint,
                        "dose": dose,
                        "frequency": freq,
                        "anupana": anupana,
                        "duration": duration_ctx,
                        "source": source.unwrap_or_else(|| "Authority Import".to_string()),
                        "status": status,
                        "exists_in_master": existing_med_map.contains_key(&m_name.to_lowercase()),
                    }));
                }
            } else {
                // MEDICINE_MASTER CSV
                let med_name = get_field(&headers, &record, &["medicine name", "name"]);
                let form = get_field(&headers, &record, &["formulation / form", "form"]);
                let strength = get_field(&headers, &record, &["strength"]);
                let english_name = get_field(&headers, &record, &["english name"]);
                let hindi_name = get_field(&headers, &record, &["hindi name"]);
                let sanskrit_name = get_field(&headers, &record, &["classical / sanskrit name", "sanskrit name"]);
                let source = get_field(&headers, &record, &["source"]);
                let source_ref = get_field(&headers, &record, &["source reference"]);
                let status = get_field(&headers, &record, &["validation status", "status"])
                    .unwrap_or_else(|| "ACTIVE".to_string());
                let notes = get_field(&headers, &record, &["notes", "description"]);

                if med_name.is_none() || med_name.as_ref().unwrap().is_empty() {
                    errors.push(CsvValidationIssue {
                        row_index: row_idx,
                        field: Some("Medicine Name".to_string()),
                        message: "Medicine name is mandatory.".to_string(),
                    });
                    continue;
                }

                let m_name = med_name.unwrap();
                let m_low = m_name.to_lowercase();

                if seen_entries.contains(&m_low) {
                    duplicate_rows += 1;
                    warnings.push(CsvValidationIssue {
                        row_index: row_idx,
                        field: None,
                        message: format!("Duplicate medicine '{}' in CSV. Action: SKIP duplicate.", m_name),
                    });
                } else {
                    seen_entries.insert(m_low.clone());
                    unique_medicines_in_csv.insert(m_low);
                }

                if preview_rows.len() < 10 {
                    preview_rows.push(serde_json::json!({
                        "row": row_idx,
                        "name": m_name,
                        "form": form,
                        "strength": strength,
                        "english_name": english_name,
                        "hindi_name": hindi_name,
                        "sanskrit_name": sanskrit_name,
                        "source": source,
                        "source_reference": source_ref,
                        "status": status,
                        "notes": notes,
                        "already_in_db": existing_med_map.contains_key(&m_name.to_lowercase()),
                    }));
                }
            }
        }

        let existing_med_count = unique_medicines_in_csv
            .iter()
            .filter(|m| existing_med_map.contains_key(*m))
            .count();
        let new_med_count = unique_medicines_in_csv.len().saturating_sub(existing_med_count);

        let can_commit = errors.is_empty() && rows_detected > 0;

        Ok(CsvPreviewResponse {
            csv_type,
            rows_detected,
            new_medicines: new_med_count,
            existing_medicines: existing_med_count,
            duplicate_rows,
            conflicts,
            warnings,
            errors,
            can_commit,
            preview_rows,
        })
    }

    /// Transactionally commit valid CSV import to database
    pub async fn commit_csv_import(
        pool: &DbPool,
        req: CsvCommitRequest,
        workspace_id: Option<&str>,
        user_id: Option<&str>,
    ) -> Result<CsvCommitResponse, AppError> {
        let clean_csv = req.csv_content.trim();
        if clean_csv.is_empty() {
            return Err(AppError::BadRequest("Cannot commit empty CSV content.".to_string()));
        }

        let mut rdr = csv::ReaderBuilder::new()
            .trim(csv::Trim::All)
            .flexible(true)
            .from_reader(clean_csv.as_bytes());

        let headers = rdr.headers()
            .map_err(|e| AppError::BadRequest(format!("Invalid CSV headers: {}", e)))?
            .clone();

        let is_clinical_ref = headers.iter().any(|h| {
            let lh = h.to_lowercase();
            lh.contains("chief complaint") || lh.contains("roga") || lh.contains("namc")
        }) || req.csv_type.as_deref().map_or(false, |t| t.eq_ignore_ascii_case("clinical_reference"));

        let dataset_name = req.dataset_name.unwrap_or_else(|| "Authority Import".to_string());
        let dataset_version = req.dataset_version.unwrap_or_else(|| "v1.0".to_string());
        let filename = req.filename.unwrap_or_else(|| "upload.csv".to_string());
        let now_str = Utc::now().to_rfc3339();

        let mut tx = pool.begin().await?;

        let mut processed = 0;
        let mut inserted_medicines = 0;
        let mut updated_medicines = 0;
        let mut inserted_references = 0;
        let mut skipped = 0;
        let mut warnings_count = 0;
        let mut errors_count = 0;

        let mut seen_batch_keys = HashSet::new();

        if is_clinical_ref {
            for result in rdr.records() {
                let record = match result {
                    Ok(r) => r,
                    Err(_) => {
                        errors_count += 1;
                        continue;
                    }
                };

                if record.is_empty() || record.iter().all(|f| f.trim().is_empty()) {
                    continue;
                }

                processed += 1;

                let complaint = get_field(&headers, &record, &["chief complaint", "complaint"]);
                let roga = get_field(&headers, &record, &["roga name", "roga", "diagnosis"]);
                let namc = get_field(&headers, &record, &["namc code", "namc"]);
                let med_name = get_field(&headers, &record, &["medicine name", "medicine"]);
                let form = get_field(&headers, &record, &["formulation / form", "form", "formulation"]);
                let dose = get_field(&headers, &record, &["dose", "dosage"]);
                let freq = get_field(&headers, &record, &["frequency / timing", "frequency", "timing"]);
                let anupana = get_field(&headers, &record, &["anupana", "vehicle"]);
                let duration_ctx = get_field(&headers, &record, &["duration / context", "duration"]);
                let source = get_field(&headers, &record, &["source"]).unwrap_or_else(|| dataset_name.clone());
                let mut status = get_field(&headers, &record, &["validation status", "status"])
                    .unwrap_or_else(|| "REFERENCE".to_string());

                if med_name.is_none() || med_name.as_ref().unwrap().is_empty() {
                    errors_count += 1;
                    continue;
                }

                let m_name = med_name.unwrap();
                let m_low = m_name.to_lowercase();

                // Check deduplication within batch
                let batch_key = format!(
                    "{}:{}:{}:{}",
                    m_low,
                    roga.as_deref().unwrap_or("").to_lowercase(),
                    dose.as_deref().unwrap_or(""),
                    anupana.as_deref().unwrap_or("")
                );
                if seen_batch_keys.contains(&batch_key) {
                    skipped += 1;
                    warnings_count += 1;
                    continue;
                }
                seen_batch_keys.insert(batch_key);

                // 1. Ensure Medicine Master record exists
                let existing_med: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM medicines WHERE LOWER(name) = ? OR code = ?"
                )
                .bind(&m_low)
                .bind(format!("MED-{}", m_low.replace(' ', "-").to_uppercase()))
                .fetch_optional(&mut *tx)
                .await?;

                let medicine_id = match existing_med {
                    Some((id,)) => id,
                    None => {
                        let med_id = format!("med_{}", Uuid::now_v7());
                        let code = format!(
                            "MED-{}",
                            m_low
                                .replace(|c: char| !c.is_alphanumeric(), "-")
                                .trim_matches('-')
                                .to_uppercase()
                        );
                        sqlx::query(
                            "INSERT INTO medicines (id, code, name, form, source, source_reference, validation_status, status, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'ACTIVE', ?, ?)"
                        )
                        .bind(&med_id)
                        .bind(&code)
                        .bind(&m_name)
                        .bind(form.as_deref())
                        .bind(&source)
                        .bind(format!("Imported via {}", filename))
                        .bind(&now_str)
                        .bind(&now_str)
                        .execute(&mut *tx)
                        .await?;

                        inserted_medicines += 1;
                        med_id
                    }
                };

                // Check conflict against existing clinical references in database
                let existing_ref: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
                    "SELECT id, dose, anupana FROM clinical_references 
                     WHERE medicine_id = ? AND LOWER(COALESCE(roga_name, '')) = LOWER(?)"
                )
                .bind(&medicine_id)
                .bind(roga.as_deref().unwrap_or(""))
                .fetch_optional(&mut *tx)
                .await?;

                let mut conflict_note = None;
                if let Some((_, ex_dose, ex_anupana)) = existing_ref {
                    let dose_diff = dose.as_deref().map(|d| d.trim()) != ex_dose.as_deref().map(|d| d.trim());
                    let anup_diff = anupana.as_deref().map(|a| a.trim()) != ex_anupana.as_deref().map(|a| a.trim());
                    if dose_diff || anup_diff {
                        status = "REQUIRES REVIEW".to_string();
                        conflict_note = Some(format!(
                            "Conflict detected: Existing dose='{:?}', anupana='{:?}' vs imported dose='{:?}', anupana='{:?}'",
                            ex_dose, ex_anupana, dose, anupana
                        ));
                    }
                }

                // Insert clinical reference
                let ref_id = format!("cref_{}", Uuid::now_v7());
                sqlx::query(
                    "INSERT INTO clinical_references (
                        id, medicine_id, chief_complaint, duration_context, roga_name,
                        namc_code, formulation_form, dose, frequency, anupana,
                        source, source_reference, source_page, validation_status,
                        dataset_version, imported_at, conflict_note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&ref_id)
                .bind(&medicine_id)
                .bind(complaint.as_deref())
                .bind(duration_ctx.as_deref())
                .bind(roga.as_deref())
                .bind(namc.as_deref())
                .bind(form.as_deref())
                .bind(dose.as_deref())
                .bind(freq.as_deref())
                .bind(anupana.as_deref())
                .bind(&source)
                .bind(format!("File: {}", filename))
                .bind(None::<String>)
                .bind(&status)
                .bind(&dataset_version)
                .bind(&now_str)
                .bind(conflict_note)
                .execute(&mut *tx)
                .await?;

                inserted_references += 1;
            }
        } else {
            // MEDICINE MASTER CSV IMPORT
            for result in rdr.records() {
                let record = match result {
                    Ok(r) => r,
                    Err(_) => {
                        errors_count += 1;
                        continue;
                    }
                };

                if record.is_empty() || record.iter().all(|f| f.trim().is_empty()) {
                    continue;
                }

                processed += 1;

                let med_name = get_field(&headers, &record, &["medicine name", "name"]);
                let form = get_field(&headers, &record, &["formulation / form", "form"]);
                let strength = get_field(&headers, &record, &["strength"]);
                let english_name = get_field(&headers, &record, &["english name"]);
                let hindi_name = get_field(&headers, &record, &["hindi name"]);
                let sanskrit_name = get_field(&headers, &record, &["classical / sanskrit name", "sanskrit name"]);
                let source = get_field(&headers, &record, &["source"]).unwrap_or_else(|| dataset_name.clone());
                let source_ref = get_field(&headers, &record, &["source reference"]).unwrap_or_else(|| format!("File: {}", filename));
                let validation_status = get_field(&headers, &record, &["validation status", "validation_status"])
                    .unwrap_or_else(|| "VALIDATED".to_string());
                let row_status = get_field(&headers, &record, &["status"])
                    .unwrap_or_else(|| "ACTIVE".to_string());
                let record_status = if row_status.to_uppercase() == "INACTIVE" { "INACTIVE" } else { "ACTIVE" };
                let notes = get_field(&headers, &record, &["notes", "description"]);

                if med_name.is_none() || med_name.as_ref().unwrap().is_empty() {
                    errors_count += 1;
                    continue;
                }

                let m_name = med_name.unwrap();
                let m_low = m_name.to_lowercase();

                if seen_batch_keys.contains(&m_low) {
                    skipped += 1;
                    warnings_count += 1;
                    continue;
                }
                seen_batch_keys.insert(m_low.clone());

                let existing: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM medicines WHERE LOWER(name) = ?"
                )
                .bind(&m_low)
                .fetch_optional(&mut *tx)
                .await?;

                if let Some((ex_id,)) = existing {
                    sqlx::query(
                        "UPDATE medicines 
                         SET form = COALESCE(?, form),
                             strength = COALESCE(?, strength),
                             english_name = COALESCE(?, english_name),
                             name_hi = COALESCE(?, name_hi),
                             sanskrit_name = COALESCE(?, sanskrit_name),
                             source = COALESCE(?, source),
                             source_reference = COALESCE(?, source_reference),
                             validation_status = ?,
                             notes = COALESCE(?, notes),
                             status = ?,
                             updated_at = ?
                         WHERE id = ?"
                    )
                    .bind(form.as_deref())
                    .bind(strength.as_deref())
                    .bind(english_name.as_deref())
                    .bind(hindi_name.as_deref())
                    .bind(sanskrit_name.as_deref())
                    .bind(Some(&source))
                    .bind(Some(&source_ref))
                    .bind(&validation_status)
                    .bind(notes.as_deref())
                    .bind(record_status)
                    .bind(&now_str)
                    .bind(&ex_id)
                    .execute(&mut *tx)
                    .await?;

                    updated_medicines += 1;
                } else {
                    let med_id = format!("med_{}", Uuid::now_v7());
                    let code = format!(
                        "MED-{}",
                        m_low
                            .replace(|c: char| !c.is_alphanumeric(), "-")
                            .trim_matches('-')
                            .to_uppercase()
                    );
                    sqlx::query(
                        "INSERT INTO medicines (
                            id, code, name, name_hi, english_name, sanskrit_name,
                            form, strength, source, source_reference, validation_status,
                            notes, description, status, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&med_id)
                    .bind(&code)
                    .bind(&m_name)
                    .bind(hindi_name.as_deref())
                    .bind(english_name.as_deref())
                    .bind(sanskrit_name.as_deref())
                    .bind(form.as_deref())
                    .bind(strength.as_deref())
                    .bind(&source)
                    .bind(&source_ref)
                    .bind(&validation_status)
                    .bind(notes.as_deref())
                    .bind(notes.as_deref())
                    .bind(record_status)
                    .bind(&now_str)
                    .bind(&now_str)
                    .execute(&mut *tx)
                    .await?;

                    inserted_medicines += 1;
                }
            }
        }

        // Commit transaction atomically
        tx.commit().await?;

        // Record audit event MEDICINE_DATA_IMPORTED
        let audit_details = serde_json::json!({
            "action": "MEDICINE_DATA_IMPORTED",
            "filename": filename,
            "dataset_name": dataset_name,
            "dataset_version": dataset_version,
            "is_clinical_reference": is_clinical_ref,
            "processed": processed,
            "inserted_medicines": inserted_medicines,
            "updated_medicines": updated_medicines,
            "inserted_references": inserted_references,
            "skipped": skipped,
            "warnings": warnings_count,
            "errors": errors_count,
        });

        let audit_id = format!("aud_{}", Uuid::now_v7());
        let _ = AuditService::log_event(
            pool,
            workspace_id,
            user_id,
            "MEDICINE_DATA_IMPORTED",
            Some("MEDICINE_MASTER"),
            None,
            None,
            audit_details,
        )
        .await;

        Ok(CsvCommitResponse {
            success: true,
            processed,
            inserted_medicines,
            updated_medicines,
            inserted_references,
            skipped,
            warnings_count,
            errors_count,
            audit_event_id: audit_id,
            message: format!(
                "Import completed successfully. Processed {} rows (New medicines: {}, References added: {}, Updated: {}, Skipped: {}).",
                processed, inserted_medicines, inserted_references, updated_medicines, skipped
            ),
        })
    }
}

// Helper to extract fields case-insensitively from CSV record
fn get_field(
    headers: &csv::StringRecord,
    record: &csv::StringRecord,
    candidates: &[&str],
) -> Option<String> {
    for (i, h) in headers.iter().enumerate() {
        let clean_h = h.trim().to_lowercase();
        for cand in candidates {
            if clean_h == *cand || clean_h.starts_with(cand) {
                if let Some(val) = record.get(i) {
                    let t = val.trim();
                    if !t.is_empty() {
                        return Some(t.to_string());
                    }
                }
            }
        }
    }
    None
}
