use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub token_hash: String,
    pub created_at: String,
    pub expires_at: String,
    pub last_seen_at: Option<String>,
    pub revoked_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserSessionProfile,
    /// True only for the bootstrap Authority account that has not yet changed its default password.
    /// Frontend must intercept and show ForceChangePassword screen. Never true for DOCTOR/ASSISTANT.
    pub must_change_password: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserSessionProfile {
    pub id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_code: Option<String>,
    pub qualification: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}
