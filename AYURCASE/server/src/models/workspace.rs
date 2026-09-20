use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Workspace {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub deactivated_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateWorkspaceRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}
