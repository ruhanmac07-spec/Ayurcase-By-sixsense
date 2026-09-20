use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct DiagnosisCatalog {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct VisitDiagnosis {
    pub id: String,
    pub visit_id: String,
    pub diagnosis_id: String,
    pub diagnosis_text: Option<String>,
    pub selected_by: String,
    pub selected_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VisitDiagnosisDetail {
    pub id: String,
    pub diagnosis_id: String,
    pub code: String,
    pub name: String,
    pub diagnosis_text: Option<String>,
    pub selected_at: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateDiagnosisRequest {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AttachDiagnosisRequest {
    pub diagnosis_id: String,
    pub diagnosis_text: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Default)]
pub struct DiagnosisSearchQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}


