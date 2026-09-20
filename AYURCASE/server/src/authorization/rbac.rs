use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthUser {
    pub user_id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub workspace_id: Option<String>,
    pub session_id: String,
}

impl AuthUser {
    pub fn is_authority(&self) -> bool {
        self.role == "AUTHORITY"
    }

    pub fn is_doctor(&self) -> bool {
        self.role == "DOCTOR"
    }

    pub fn is_assistant(&self) -> bool {
        self.role == "ASSISTANT"
    }

    pub fn require_role(&self, allowed: &[&str]) -> Result<(), AppError> {
        if allowed.contains(&self.role.as_str()) {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!(
                "Role '{}' is not authorized for this operation",
                self.role
            )))
        }
    }

    pub fn require_workspace(&self, target_workspace_id: &str) -> Result<(), AppError> {
        // Global Authority can access any workspace if needed, but if assigned, checks are respected
        if self.is_authority() {
            return Ok(());
        }

        match &self.workspace_id {
            Some(ws_id) if ws_id == target_workspace_id => Ok(()),
            Some(_) => Err(AppError::Forbidden(
                "Access denied: cross-workspace access is prohibited".to_string(),
            )),
            None => Err(AppError::Forbidden(
                "User has no workspace assigned".to_string(),
            )),
        }
    }

    pub fn require_doctor_match(&self, doctor_id: &str) -> Result<(), AppError> {
        if self.is_authority() {
            return Ok(());
        }
        if self.user_id == doctor_id {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "Access denied: this record is assigned to another clinician".to_string(),
            ))
        }
    }
}
