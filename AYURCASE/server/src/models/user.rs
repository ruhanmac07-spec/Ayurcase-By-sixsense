use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: String,
    pub workspace_id: Option<String>,
    pub username: String,
    pub full_name: String,
    pub role: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub status: String,
    pub must_change_password: i64,
    pub created_at: String,
    pub updated_at: String,
    pub last_login_at: Option<String>,
    pub deactivated_at: Option<String>,
    pub phone: Option<String>,
    pub qualification: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserSummary {
    pub id: String,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub status: String,
    pub last_login_at: Option<String>,
    pub qualification: Option<String>,
}

/// Request payload for creating a DOCTOR or ASSISTANT via the Authority panel.
/// Username is auto-generated from full_name in `firstname.lastname@ayush.com` format.
/// Password is generated from the phone number.
#[derive(Clone, Debug, Deserialize)]
pub struct CreateUserRequest {
    pub workspace_id: Option<String>,
    pub full_name: String,
    pub role: String,
    /// Phone number — required for DOCTOR and ASSISTANT.
    /// Used as the initial login password and stored separately.
    pub phone: Option<String>,
    /// Professional medical qualification (e.g. "BAMS, MD Ayurveda").
    pub qualification: Option<String>,
}

/// Returned only at the moment of user creation. The `generated_password` field
/// contains the plaintext initial password — it is shown ONCE to the Authority
/// and cannot be recovered from the server afterwards.
#[derive(Clone, Debug, Serialize)]
pub struct CreateUserResponse {
    pub user: UserSummary,
    pub generated_username: String,
    pub generated_password: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub full_name: Option<String>,
    pub workspace_id: Option<String>,
    pub role: Option<String>,
    pub status: Option<String>,
    pub qualification: Option<String>,
}

/// Authority password reset request.
/// The `new_password` is provided by Authority, hashed server-side.
/// The plaintext is returned once in `ResetPasswordResponse` for the credential sheet.
#[derive(Clone, Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

/// Returned only at the moment of password reset. The `generated_password` field
/// contains the plaintext new password — shown ONCE to the Authority.
#[derive(Clone, Debug, Serialize)]
pub struct ResetPasswordResponse {
    pub generated_password: String,
}
