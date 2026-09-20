use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Document {
    pub id: String,
    pub visit_id: String,
    pub document_type: String,
    pub file_path: String,
    pub file_hash: Option<String>,
    pub generated_by: String,
    pub generated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DocumentSummary {
    pub id: String,
    pub visit_id: String,
    pub document_type: String,
    pub file_path: String,
    pub file_hash: Option<String>,
    pub generated_at: String,
}
