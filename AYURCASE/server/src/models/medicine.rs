use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Medicine {
    pub id: String,
    pub code: String,
    pub name: String,
    #[sqlx(default)]
    pub name_hi: Option<String>,
    #[sqlx(default)]
    pub english_name: Option<String>,
    #[sqlx(default)]
    pub sanskrit_name: Option<String>,
    #[sqlx(default)]
    pub form: Option<String>,
    #[sqlx(default)]
    pub strength: Option<String>,
    #[sqlx(default)]
    pub source: Option<String>,
    #[sqlx(default)]
    pub source_reference: Option<String>,
    #[sqlx(default)]
    pub validation_status: Option<String>,
    #[sqlx(default)]
    pub notes: Option<String>,
    #[sqlx(default)]
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct ClinicalReference {
    pub id: String,
    pub medicine_id: String,
    #[sqlx(default)]
    pub diagnosis_id: Option<String>,
    #[sqlx(default)]
    pub chief_complaint: Option<String>,
    #[sqlx(default)]
    pub duration_context: Option<String>,
    #[sqlx(default)]
    pub roga_name: Option<String>,
    #[sqlx(default)]
    pub namc_code: Option<String>,
    #[sqlx(default)]
    pub formulation_form: Option<String>,
    #[sqlx(default)]
    pub dose: Option<String>,
    #[sqlx(default)]
    pub frequency: Option<String>,
    #[sqlx(default)]
    pub anupana: Option<String>,
    pub source: String,
    #[sqlx(default)]
    pub source_reference: Option<String>,
    #[sqlx(default)]
    pub source_page: Option<String>,
    pub validation_status: String,
    pub dataset_version: String,
    pub imported_at: String,
    #[sqlx(default)]
    pub conflict_note: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MedicineSearchResult {
    pub id: String,
    pub code: String,
    pub name: String,
    pub name_hi: Option<String>,
    pub english_name: Option<String>,
    pub sanskrit_name: Option<String>,
    pub form: Option<String>,
    pub strength: Option<String>,
    pub status: String,
    pub references: Vec<ClinicalReference>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CsvValidationIssue {
    pub row_index: usize,
    pub field: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CsvPreviewResponse {
    pub csv_type: String,
    pub rows_detected: usize,
    pub new_medicines: usize,
    pub existing_medicines: usize,
    pub duplicate_rows: usize,
    pub conflicts: usize,
    pub warnings: Vec<CsvValidationIssue>,
    pub errors: Vec<CsvValidationIssue>,
    pub can_commit: bool,
    pub preview_rows: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CsvCommitRequest {
    pub csv_type: Option<String>,
    pub csv_content: String,
    pub filename: Option<String>,
    pub dataset_name: Option<String>,
    pub dataset_version: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CsvCommitResponse {
    pub success: bool,
    pub processed: usize,
    pub inserted_medicines: usize,
    pub updated_medicines: usize,
    pub inserted_references: usize,
    pub skipped: usize,
    pub warnings_count: usize,
    pub errors_count: usize,
    pub audit_event_id: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MedicineSearchQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateMedicineRequest {
    pub code: String,
    pub name: String,
    pub name_hi: Option<String>,
    pub english_name: Option<String>,
    pub sanskrit_name: Option<String>,
    pub form: Option<String>,
    pub strength: Option<String>,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateMedicineRequest {
    pub name: Option<String>,
    pub name_hi: Option<String>,
    pub english_name: Option<String>,
    pub sanskrit_name: Option<String>,
    pub form: Option<String>,
    pub strength: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
}

