use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Prescription {
    pub id: String,
    pub visit_id: String,
    pub status: String,
    pub source_rule_id: Option<String>,
    pub source_rule_version: Option<i64>,
    pub created_by: String,
    pub finalized_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub finalized_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct PrescriptionItem {
    pub id: String,
    pub prescription_id: String,
    pub medicine_id: Option<String>,
    pub medicine_name_snapshot: String,
    pub dosage_text: Option<String>,
    pub frequency_text: Option<String>,
    pub duration_text: Option<String>,
    pub anupana_text: Option<String>,
    pub pathya_text: Option<String>,
    pub apathya_text: Option<String>,
    pub source_type: String, // 'RULE_SUGGESTION' | 'DOCTOR_ADDED'
    pub rule_id: Option<String>,
    pub rule_version: Option<i64>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PrescriptionDetail {
    pub prescription: Prescription,
    pub items: Vec<PrescriptionItem>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SavePrescriptionDraftRequest {
    pub source_rule_id: Option<String>,
    pub source_rule_version: Option<i64>,
    pub items: Vec<PrescriptionItemInput>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PrescriptionItemInput {
    pub medicine_id: Option<String>,
    pub medicine_name_snapshot: String,
    pub dosage_text: Option<String>,
    pub frequency_text: Option<String>,
    pub duration_text: Option<String>,
    pub anupana_text: Option<String>,
    pub pathya_text: Option<String>,
    pub apathya_text: Option<String>,
    pub source_type: String,
    pub rule_id: Option<String>,
    pub rule_version: Option<i64>,
}
