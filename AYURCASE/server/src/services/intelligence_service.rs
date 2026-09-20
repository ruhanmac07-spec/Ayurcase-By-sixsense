use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::AppError;
use crate::repositories::DbPool;

pub const HISTORICAL_DISCLAIMER: &str =
    "Historical Case Reference Only — Requires Independent Clinical Evaluation";
pub const ANALYTICS_DISCLAIMER: &str =
    "Observational Analytics Only — Not Clinical Recommendations. Requires Validated Clinical Rule.";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoricalMedicineItem {
    pub medicine_name: String,
    pub dosage: Option<String>,
    pub frequency: Option<String>,
    pub duration: Option<String>,
    pub source_type: String,
    pub rule_code: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoricalCase {
    pub visit_id: String,
    pub visit_number: String,
    pub visit_date: String,
    pub patient_code: String,
    pub chief_complaint: String,
    pub diagnoses: Vec<String>,
    pub medicines: Vec<HistoricalMedicineItem>,
    pub source_rule_code: Option<String>,
    pub source_rule_version: Option<i64>,
    pub disclaimer: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ComplaintCluster {
    pub complaint: String,
    pub count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MedicineFrequency {
    pub medicine_name: String,
    pub count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiagnosisMedicinePattern {
    pub diagnosis_name: String,
    pub top_medicines: Vec<MedicineFrequency>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CoPrescriptionPair {
    pub medicine_a: String,
    pub medicine_b: String,
    pub count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ObservationalAnalytics {
    pub complaint_clusters: Vec<ComplaintCluster>,
    pub diagnosis_patterns: Vec<DiagnosisMedicinePattern>,
    pub common_co_prescriptions: Vec<CoPrescriptionPair>,
    pub total_analyzed_visits: i64,
    pub disclaimer: String,
}

pub struct IntelligenceService;

impl IntelligenceService {
    /// Search past cases in the same workspace matching query against complaints or diagnoses.
    /// Excludes current_visit_id if provided.
    /// Strictly read-only.
    pub async fn search_similar_cases(
        pool: &DbPool,
        workspace_id: &str,
        query: &str,
        exclude_visit_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<HistoricalCase>, AppError> {
        let trimmed = query.trim();
        let search_pattern = format!("%{}%", trimmed);

        // Fetch candidate visits matching complaint or diagnosis in this workspace
        let visits_query = if trimmed.is_empty() {
            sqlx::query_as::<_, (String, String, String, String, Option<String>, Option<String>, Option<i64>)>(
                "SELECT v.id, v.visit_number, v.visit_date, p.patient_code,
                        ch.chief_complaint, rx.source_rule_id, rx.source_rule_version
                 FROM visits v
                 JOIN patients p ON p.id = v.patient_id
                 LEFT JOIN complaints_history ch ON ch.visit_id = v.id
                 LEFT JOIN prescriptions rx ON rx.visit_id = v.id AND rx.status = 'FINALIZED'
                 WHERE v.workspace_id = ?
                   AND (? IS NULL OR v.id != ?)
                   AND ch.chief_complaint IS NOT NULL
                 ORDER BY v.created_at DESC
                 LIMIT ?"
            )
            .bind(workspace_id)
            .bind(exclude_visit_id)
            .bind(exclude_visit_id)
            .bind(limit)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, (String, String, String, String, Option<String>, Option<String>, Option<i64>)>(
                "SELECT DISTINCT v.id, v.visit_number, v.visit_date, p.patient_code,
                        ch.chief_complaint, rx.source_rule_id, rx.source_rule_version
                 FROM visits v
                 JOIN patients p ON p.id = v.patient_id
                 LEFT JOIN complaints_history ch ON ch.visit_id = v.id
                 LEFT JOIN visit_diagnoses vd ON vd.visit_id = v.id
                 LEFT JOIN diagnosis_catalog dc ON dc.id = vd.diagnosis_id
                 LEFT JOIN prescriptions rx ON rx.visit_id = v.id AND rx.status = 'FINALIZED'
                 WHERE v.workspace_id = ?
                   AND (? IS NULL OR v.id != ?)
                   AND (
                       ch.chief_complaint LIKE ?
                       OR ch.history_text LIKE ?
                       OR dc.name LIKE ?
                       OR vd.diagnosis_text LIKE ?
                   )
                 ORDER BY v.created_at DESC
                 LIMIT ?"
            )
            .bind(workspace_id)
            .bind(exclude_visit_id)
            .bind(exclude_visit_id)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(limit)
            .fetch_all(pool)
            .await?
        };

        let mut cases = Vec::new();

        for (vid, v_num, v_date, p_code, chief_c, src_rule_id, src_rule_ver) in visits_query {
            // Get diagnoses for this visit
            let diagnoses_rows: Vec<(String,)> = sqlx::query_as(
                "SELECT dc.name
                 FROM visit_diagnoses vd
                 JOIN diagnosis_catalog dc ON dc.id = vd.diagnosis_id
                 WHERE vd.visit_id = ?"
            )
            .bind(&vid)
            .fetch_all(pool)
            .await?;

            let diagnoses: Vec<String> = diagnoses_rows.into_iter().map(|r| r.0).collect();

            // Get medicines for this visit from finalized prescription
            let med_rows: Vec<(String, Option<String>, Option<String>, Option<String>, String, Option<String>)> = sqlx::query_as(
                "SELECT pi.medicine_name_snapshot, pi.dosage_text, pi.frequency_text, pi.duration_text,
                        pi.source_type, cr.rule_code
                 FROM prescriptions rx
                 JOIN prescription_items pi ON pi.prescription_id = rx.id
                 LEFT JOIN clinical_rules cr ON cr.id = pi.rule_id
                 WHERE rx.visit_id = ?"
            )
            .bind(&vid)
            .fetch_all(pool)
            .await?;

            let medicines = med_rows
                .into_iter()
                .map(|(m_name, dose, freq, dur, src, r_code)| HistoricalMedicineItem {
                    medicine_name: m_name,
                    dosage: dose,
                    frequency: freq,
                    duration: dur,
                    source_type: src,
                    rule_code: r_code,
                })
                .collect();

            let rule_code: Option<String> = if let Some(ref rid) = src_rule_id {
                sqlx::query_as::<_, (String,)>("SELECT rule_code FROM clinical_rules WHERE id = ?")
                    .bind(rid)
                    .fetch_optional(pool)
                    .await?
                    .map(|r| r.0)
            } else {
                None
            };

            cases.push(HistoricalCase {
                visit_id: vid,
                visit_number: v_num,
                visit_date: v_date,
                patient_code: p_code,
                chief_complaint: chief_c.unwrap_or_else(|| "No recorded complaint".to_string()),
                diagnoses,
                medicines,
                source_rule_code: rule_code,
                source_rule_version: src_rule_ver,
                disclaimer: HISTORICAL_DISCLAIMER.to_string(),
            });
        }

        Ok(cases)
    }

    /// Read-only observational pattern analytics over past visits in the workspace.
    /// strictly non-generative, never modifies rules or prescribes.
    pub async fn get_pattern_analytics(
        pool: &DbPool,
        workspace_id: &str,
    ) -> Result<ObservationalAnalytics, AppError> {
        let total_visits: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM visits WHERE workspace_id = ?"
        )
        .bind(workspace_id)
        .fetch_one(pool)
        .await?;

        // 1. Complaint clusters: group top chief complaints
        let complaint_rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT LOWER(TRIM(ch.chief_complaint)) as complaint, COUNT(*) as cnt
             FROM complaints_history ch
             JOIN visits v ON v.id = ch.visit_id
             WHERE v.workspace_id = ? AND ch.chief_complaint IS NOT NULL AND TRIM(ch.chief_complaint) != ''
             GROUP BY LOWER(TRIM(ch.chief_complaint))
             ORDER BY cnt DESC
             LIMIT 10"
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;

        let complaint_clusters = complaint_rows
            .into_iter()
            .map(|(c, cnt)| ComplaintCluster {
                complaint: c,
                count: cnt,
            })
            .collect();

        // 2. Most prescribed medicines per diagnosis
        let diag_med_rows: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT dc.name, pi.medicine_name_snapshot, COUNT(*) as cnt
             FROM visit_diagnoses vd
             JOIN visits v ON v.id = vd.visit_id
             JOIN diagnosis_catalog dc ON dc.id = vd.diagnosis_id
             JOIN prescriptions rx ON rx.visit_id = v.id
             JOIN prescription_items pi ON pi.prescription_id = rx.id
             WHERE v.workspace_id = ?
             GROUP BY dc.name, pi.medicine_name_snapshot
             ORDER BY dc.name ASC, cnt DESC"
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;

        let mut diag_map: HashMap<String, Vec<MedicineFrequency>> = HashMap::new();
        for (diag_name, med_name, cnt) in diag_med_rows {
            diag_map
                .entry(diag_name)
                .or_default()
                .push(MedicineFrequency {
                    medicine_name: med_name,
                    count: cnt,
                });
        }

        let mut diagnosis_patterns = Vec::new();
        for (diag_name, mut meds) in diag_map {
            meds.truncate(5); // Top 5 per diagnosis
            diagnosis_patterns.push(DiagnosisMedicinePattern {
                diagnosis_name: diag_name,
                top_medicines: meds,
            });
        }
        diagnosis_patterns.sort_by(|a, b| a.diagnosis_name.cmp(&b.diagnosis_name));

        // 3. Common co-prescriptions (pairs of medicines in the same prescription)
        let co_rx_rows: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT a.medicine_name_snapshot, b.medicine_name_snapshot, COUNT(*) as cnt
             FROM prescription_items a
             JOIN prescription_items b ON a.prescription_id = b.prescription_id AND a.medicine_name_snapshot < b.medicine_name_snapshot
             JOIN prescriptions rx ON rx.id = a.prescription_id
             JOIN visits v ON v.id = rx.visit_id
             WHERE v.workspace_id = ?
             GROUP BY a.medicine_name_snapshot, b.medicine_name_snapshot
             ORDER BY cnt DESC
             LIMIT 10"
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;

        let common_co_prescriptions = co_rx_rows
            .into_iter()
            .map(|(med_a, med_b, cnt)| CoPrescriptionPair {
                medicine_a: med_a,
                medicine_b: med_b,
                count: cnt,
            })
            .collect();

        Ok(ObservationalAnalytics {
            complaint_clusters,
            diagnosis_patterns,
            common_co_prescriptions,
            total_analyzed_visits: total_visits.0,
            disclaimer: ANALYTICS_DISCLAIMER.to_string(),
        })
    }
}
