use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct QueueEntry {
    pub id: String,
    pub visit_id: String,
    pub workspace_id: String,
    pub doctor_id: String,
    pub status: String,
    pub priority: i64,
    pub queued_at: String,
    pub called_at: Option<String>,
    pub completed_at: Option<String>,
    pub transferred_at: Option<String>,
    pub created_by: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DoctorQueueItem {
    pub queue_id: String,
    pub visit_id: String,
    pub visit_number: String,
    pub patient_id: String,
    pub patient_name: String,
    pub patient_code: String,
    pub patient_phone: Option<String>,
    pub patient_sex: Option<String>,
    pub patient_dob: Option<String>,
    pub purpose: Option<String>,
    pub status: String,
    pub priority: i64,
    pub queued_at: String,
    pub waiting_duration_mins: i64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TransferVisitRequest {
    pub target_doctor_id: String,
    pub reason: Option<String>,
}
