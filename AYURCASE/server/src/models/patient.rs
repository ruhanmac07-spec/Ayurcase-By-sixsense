use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Patient {
    pub id: String,
    pub workspace_id: String,
    pub patient_code: String,
    pub opd_case_id: Option<String>,
    pub full_name: String,
    pub date_of_birth: Option<String>,
    pub sex: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub emergency_contact: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreatePatientRequest {
    pub workspace_id: Option<String>,
    pub doctor_id: Option<String>,
    pub patient_code: Option<String>,
    pub opd_case_id: Option<String>,
    pub full_name: String,
    pub date_of_birth: Option<String>,
    pub sex: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub emergency_contact: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdatePatientRequest {
    pub full_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub sex: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub emergency_contact: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DuplicateCheckResult {
    pub has_potential_duplicates: bool,
    pub duplicates: Vec<Patient>,
}
