use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Visit {
    pub id: String,
    pub workspace_id: String,
    pub patient_id: String,
    pub doctor_id: String,
    pub visit_number: String,
    pub visit_date: String,
    pub purpose: Option<String>,
    pub status: String,
    pub created_by: String,
    pub updated_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub finalized_at: Option<String>,
    /// Human-readable per-visit OPD identifier: PATIENT_CODE/DD/MM/YYYY
    /// e.g. "00001/17/09/2026". Auto-generated server-side at visit creation.
    pub opd_number: Option<String>,
    /// Per-patient chronological visit counter (1-based).
    /// Displayed as zero-padded "01", "02", "03" etc.
    pub patient_visit_seq: Option<i64>,
}

/// Formats an ISO date/timestamp string (e.g. "2026-09-17" or "2026-09-17T15:53:48...")
/// to the clinical display format DD/MM/YYYY.
/// Returns the input string unchanged if parsing fails.
pub fn format_display_date(iso: &str) -> String {
    let s = iso.trim();
    // Take only the date portion (before 'T' or space)
    let date_part = s.split(['T', ' ']).next().unwrap_or(s).trim();
    if date_part.contains('-') {
        let parts: Vec<&str> = date_part.split('-').collect();
        if parts.len() == 3 {
            if parts[0].len() == 4 {
                // YYYY-MM-DD -> DD/MM/YYYY
                return format!("{:0>2}/{:0>2}/{}", parts[2], parts[1], parts[0]);
            } else if parts[2].len() == 4 {
                // DD-MM-YYYY -> DD/MM/YYYY
                return format!("{:0>2}/{:0>2}/{}", parts[0], parts[1], parts[2]);
            }
        }
    } else if date_part.contains('/') {
        let parts: Vec<&str> = date_part.split('/').collect();
        if parts.len() == 3 {
            if parts[0].len() == 4 {
                // YYYY/MM/DD -> DD/MM/YYYY
                return format!("{:0>2}/{:0>2}/{}", parts[2], parts[1], parts[0]);
            } else if parts[2].len() == 4 {
                // DD/MM/YYYY -> zero-padded
                return format!("{:0>2}/{:0>2}/{}", parts[0], parts[1], parts[2]);
            }
        }
    }
    date_part.to_string()
}

/// Formats a DOB value (may be "YYYY-MM-DD", "DD/MM/YYYY", etc.) to DD/MM/YYYY.
/// Returns None if the input is None, empty, or invalid placeholder ("-", "None", "null").
pub fn format_display_dob(dob: Option<&str>) -> Option<String> {
    dob.and_then(|s| {
        let s = s.trim();
        if s.is_empty() || s == "-" || s == "None" || s == "null" {
            None
        } else {
            Some(format_display_date(s))
        }
    })
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Consent {
    pub id: String,
    pub visit_id: String,
    pub consent_status: String,
    pub consent_text_version: Option<String>,
    pub captured_by: String,
    pub captured_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Vitals {
    pub id: String,
    pub visit_id: String,
    pub temperature: Option<f64>,
    pub pulse_rate: Option<i64>,
    pub respiratory_rate: Option<i64>,
    pub systolic_bp: Option<i64>,
    pub diastolic_bp: Option<i64>,
    pub oxygen_saturation: Option<f64>,
    pub height_cm: Option<f64>,
    pub weight_kg: Option<f64>,
    pub notes: Option<String>,
    pub recorded_by: String,
    pub recorded_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct ComplaintsHistory {
    pub id: String,
    pub visit_id: String,
    pub chief_complaint: Option<String>,
    pub history_text: Option<String>,
    pub past_history: Option<String>,
    pub family_history: Option<String>,
    pub personal_history: Option<String>,
    pub recorded_by: String,
    pub recorded_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct AyushCaseTaking {
    pub id: String,
    pub visit_id: String,
    pub data_json: String,
    pub schema_version: Option<String>,
    pub recorded_by: String,
    pub recorded_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateVisitIntakeRequest {
    pub workspace_id: Option<String>,
    pub patient_id: String,
    pub doctor_id: String,
    pub purpose: Option<String>,
    pub priority: Option<i64>,
    // Consent
    pub consent_status: Option<String>,
    pub consent_version: Option<String>,
    // Vitals
    pub temperature: Option<f64>,
    pub pulse_rate: Option<i64>,
    pub respiratory_rate: Option<i64>,
    pub systolic_bp: Option<i64>,
    pub diastolic_bp: Option<i64>,
    pub oxygen_saturation: Option<f64>,
    pub height_cm: Option<f64>,
    pub weight_kg: Option<f64>,
    pub vitals_notes: Option<String>,
    // Idempotency
    pub idempotency_key: Option<String>,
    // Repeatable Chief Complaints & Case Taking at Intake
    pub complaints_list: Option<Vec<VisitComplaintItem>>,
    pub ayush_data_json: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct VisitComplaint {
    pub id: String,
    pub visit_id: String,
    pub complaint_text: String,
    pub duration_value: Option<i64>,
    pub duration_unit: Option<String>,
    pub notes: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VisitComplaintItem {
    pub complaint_text: String,
    pub duration_value: Option<i64>,
    pub duration_unit: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VisitDetailResponse {
    pub visit: Visit,
    pub patient_name: String,
    pub patient_code: String,
    pub doctor_name: String,
    pub consent: Option<Consent>,
    pub vitals: Option<Vitals>,
    pub complaints: Option<ComplaintsHistory>,
    #[serde(default)]
    pub complaints_list: Vec<VisitComplaint>,
    pub ayush_case: Option<AyushCaseTaking>,
    pub queue_entry: Option<crate::models::queue::QueueEntry>,
}
