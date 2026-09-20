use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: String,
    pub workspace_id: Option<String>,
    pub user_id: Option<String>,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub request_id: Option<String>,
    pub details_json: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub details_json: String,
    pub created_at: String,
}
