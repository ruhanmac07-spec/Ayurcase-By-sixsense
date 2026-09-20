use crate::audit::AuditService;
use crate::auth::hash_password;
use crate::error::AppError;
use crate::models::user::{
    CreateUserRequest, CreateUserResponse, ResetPasswordRequest, ResetPasswordResponse,
    UpdateUserRequest, User, UserSummary,
};
use crate::repositories::DbPool;
use chrono::Utc;
use uuid::Uuid;

pub struct UserService;

impl UserService {
    pub async fn list(
        pool: &DbPool,
        workspace_id: Option<&str>,
    ) -> Result<Vec<UserSummary>, AppError> {
        let users: Vec<(String, Option<String>, Option<String>, String, String, String, String, Option<String>, Option<String>)> = if let Some(ws_id) = workspace_id {
            sqlx::query_as(
                "SELECT u.id, u.workspace_id, w.name, u.username, u.full_name, u.role, u.status, u.last_login_at, u.qualification
                 FROM users u
                 LEFT JOIN workspaces w ON w.id = u.workspace_id
                 WHERE u.workspace_id = ?
                 ORDER BY u.created_at ASC"
            )
            .bind(ws_id)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as(
                "SELECT u.id, u.workspace_id, w.name, u.username, u.full_name, u.role, u.status, u.last_login_at, u.qualification
                 FROM users u
                 LEFT JOIN workspaces w ON w.id = u.workspace_id
                 ORDER BY u.created_at ASC"
            )
            .fetch_all(pool)
            .await?
        };

        let summaries = users
            .into_iter()
            .map(|(id, ws_id, ws_name, username, full_name, role, status, last_login, qualification)| {
                UserSummary {
                    id,
                    workspace_id: ws_id,
                    workspace_name: ws_name,
                    username,
                    full_name,
                    role,
                    status,
                    last_login_at: last_login,
                    qualification,
                }
            })
            .collect();

        Ok(summaries)
    }

    pub async fn get_summary(pool: &DbPool, id: &str) -> Result<UserSummary, AppError> {
        let user: Option<(String, Option<String>, Option<String>, String, String, String, String, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT u.id, u.workspace_id, w.name, u.username, u.full_name, u.role, u.status, u.last_login_at, u.qualification
             FROM users u
             LEFT JOIN workspaces w ON w.id = u.workspace_id
             WHERE u.id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        let (id, ws_id, ws_name, username, full_name, role, status, last_login, qualification) = user
            .ok_or_else(|| AppError::NotFound(format!("User '{}' not found", id)))?;

        Ok(UserSummary {
            id,
            workspace_id: ws_id,
            workspace_name: ws_name,
            username,
            full_name,
            role,
            status,
            last_login_at: last_login,
            qualification,
        })
    }

    /// Generate a username from a full name and role.
    /// For DOCTOR: extracts first name, prefixes with `dr.`, e.g. "Ayush Mani Sharma" -> `dr.ayush@ayush.com`.
    /// For other roles: extracts first name, e.g. "Priya Singh" -> `priya@ayush.com`.
    /// Handles collisions by appending a numeric suffix (e.g. `dr.ayush2@ayush.com`).
    async fn generate_username(pool: &DbPool, full_name: &str, role: &str) -> Result<String, AppError> {
        // Split full name into words
        let raw_words: Vec<String> = full_name
            .split_whitespace()
            .map(|w| {
                w.chars()
                    .filter(|c| c.is_alphanumeric())
                    .collect::<String>()
                    .to_lowercase()
            })
            .filter(|w| !w.is_empty())
            .collect();

        if raw_words.is_empty() {
            return Err(AppError::Validation("Full name cannot be empty or contain only special characters".to_string()));
        }

        // Filter out titles like "dr", "doctor" if entered at the beginning
        let title_prefixes = ["dr", "doctor"];
        let mut words_iter = raw_words.iter();
        let first_word = loop {
            match words_iter.next() {
                Some(w) if title_prefixes.contains(&w.as_str()) => continue,
                Some(w) => break w.clone(),
                None => {
                    // Fallback to the first word if only title was provided
                    break raw_words[0].clone();
                }
            }
        };

        let handle = if role.eq_ignore_ascii_case("DOCTOR") {
            format!("dr.{}", first_word)
        } else {
            first_word
        };

        let base = format!("{}@ayush.com", handle);

        // Check if base username is free
        let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM users WHERE username = ?")
            .bind(&base)
            .fetch_optional(pool)
            .await?;

        if exists.is_none() {
            return Ok(base);
        }

        // Find a free slot by appending suffix 2, 3, 4 …
        for suffix in 2u32..=99 {
            let candidate = format!("{}{}@ayush.com", handle, suffix);
            let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM users WHERE username = ?")
                .bind(&candidate)
                .fetch_optional(pool)
                .await?;
            if exists.is_none() {
                return Ok(candidate);
            }
        }

        Err(AppError::Conflict(format!(
            "Cannot generate a unique username for '{}'. Please use a different name.",
            full_name
        )))
    }

    /// Create a new Doctor or Assistant account.
    /// The username is auto-generated using first name and role prefix (e.g. `dr.ayush@ayush.com`).
    /// The initial password is the phone number (hashed before storage).
    /// The plaintext credentials are returned ONCE in `CreateUserResponse`
    /// so the Authority can display them to the new user.
    pub async fn create(
        pool: &DbPool,
        req: CreateUserRequest,
        actor_id: &str,
    ) -> Result<CreateUserResponse, AppError> {
        if req.full_name.trim().is_empty() {
            return Err(AppError::Validation("Full Name is required".to_string()));
        }

        let role = req.role.trim().to_uppercase();
        if !["AUTHORITY", "DOCTOR", "ASSISTANT"].contains(&role.as_str()) {
            return Err(AppError::Validation(
                "Invalid role. Allowed: AUTHORITY, DOCTOR, ASSISTANT".to_string(),
            ));
        }

        // Phone is mandatory for DOCTOR and ASSISTANT; it becomes the initial password.
        let phone = match req.phone {
            Some(ref p) if !p.trim().is_empty() => p.trim().to_string(),
            _ if role != "AUTHORITY" => {
                return Err(AppError::Validation(
                    "Phone number is required for Doctor and Assistant accounts".to_string(),
                ));
            }
            // AUTHORITY accounts use a different bootstrap path — this shouldn't normally be called
            _ => String::new(),
        };

        // Validate phone format (10 digits for DOCTOR/ASSISTANT)
        if role != "AUTHORITY" && !phone.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::Validation(
                "Phone number must contain only digits".to_string(),
            ));
        }
        if role != "AUTHORITY" && (phone.len() < 10 || phone.len() > 15) {
            return Err(AppError::Validation(
                "Phone number must be 10–15 digits".to_string(),
            ));
        }

        // Auto-generate username (e.g. dr.ayush@ayush.com for DOCTOR)
        let username = Self::generate_username(pool, req.full_name.trim(), &role).await?;

        // The initial password is the phone number (plaintext, will be hashed immediately)
        let initial_password = phone.clone();
        let pass_hash = hash_password(&initial_password)?;

        let id = format!("usr_{}", Uuid::now_v7());
        let now_str = Utc::now().to_rfc3339();
        let qualification = req.qualification.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());

        sqlx::query(
            "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password, phone, qualification, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&req.workspace_id)
        .bind(&username)
        .bind(req.full_name.trim())
        .bind(&role)
        .bind(&pass_hash)
        .bind(if phone.is_empty() { None } else { Some(&phone) })
        .bind(qualification)
        .bind(&now_str)
        .bind(&now_str)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            req.workspace_id.as_deref(),
            Some(actor_id),
            "CREATE_USER",
            Some("USER"),
            Some(&id),
            None,
            // Never log the plaintext password
            serde_json::json!({ "username": username, "role": role, "qualification": qualification }),
        )
        .await;

        // Automatically create Doctor storage folder if applicable
        if role == "DOCTOR" {
            if let Some(ref ws_id) = req.workspace_id {
                if let Ok(Some((ws_name,))) = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
                    .bind(ws_id)
                    .fetch_optional(pool)
                    .await
                {
                    let _ = crate::services::storage_service::PatientStorageService::ensure_doctor_folder(
                        &ws_name,
                        req.full_name.trim(),
                    );
                }
            }
        }

        let user_summary = Self::get_summary(pool, &id).await?;

        Ok(CreateUserResponse {
            generated_username: username,
            generated_password: initial_password,
            user: user_summary,
        })
    }

    pub async fn update(
        pool: &DbPool,
        id: &str,
        req: UpdateUserRequest,
        actor_id: &str,
    ) -> Result<UserSummary, AppError> {
        let existing: User = sqlx::query_as(
            "SELECT id, workspace_id, username, full_name, role, password_hash, status,
                    must_change_password, created_at, updated_at, last_login_at, deactivated_at, phone, qualification
             FROM users WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User '{}' not found", id)))?;

        let full_name = req.full_name.unwrap_or(existing.full_name);
        let role = req.role.unwrap_or(existing.role);
        let workspace_id = req.workspace_id.or(existing.workspace_id);
        let status = req.status.unwrap_or(existing.status);
        let qualification = req.qualification.or(existing.qualification);
        let now_str = Utc::now().to_rfc3339();

        let deactivated_at = if status == "DEACTIVATED" {
            Some(existing.deactivated_at.unwrap_or_else(|| Utc::now().to_rfc3339()))
        } else {
            None
        };

        sqlx::query(
            "UPDATE users
             SET full_name = ?, role = ?, workspace_id = ?, status = ?, deactivated_at = ?, qualification = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&full_name)
        .bind(&role)
        .bind(&workspace_id)
        .bind(&status)
        .bind(&deactivated_at)
        .bind(&qualification)
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        if status == "DEACTIVATED" {
            let _ = sqlx::query("DELETE FROM sessions WHERE user_id = ?")
                .bind(id)
                .execute(pool)
                .await;
        }

        let _ = AuditService::log_event(
            pool,
            workspace_id.as_deref(),
            Some(actor_id),
            "UPDATE_USER",
            Some("USER"),
            Some(id),
            None,
            serde_json::json!({ "full_name": full_name, "role": role, "status": status }),
        )
        .await;

        if role == "DOCTOR" && status == "ACTIVE" {
            if let Some(ref ws_id) = workspace_id {
                if let Ok(Some((ws_name,))) = sqlx::query_as::<_, (String,)>("SELECT name FROM workspaces WHERE id = ?")
                    .bind(ws_id)
                    .fetch_optional(pool)
                    .await
                {
                    let _ = crate::services::storage_service::PatientStorageService::ensure_doctor_folder(&ws_name, &full_name);
                }
            }
        }

        Self::get_summary(pool, id).await
    }

    pub async fn deactivate(pool: &DbPool, id: &str, actor_id: &str) -> Result<(), AppError> {
        let now_str = Utc::now().to_rfc3339();

        // 1. Deactivate user
        sqlx::query(
            "UPDATE users
             SET status = 'DEACTIVATED', deactivated_at = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&now_str)
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        // 2. Invalidate all active sessions immediately
        sqlx::query("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
            .bind(&now_str)
            .bind(id)
            .execute(pool)
            .await?;

        let _ = AuditService::log_event(
            pool,
            None,
            Some(actor_id),
            "DEACTIVATE_USER",
            Some("USER"),
            Some(id),
            None,
            serde_json::json!({}),
        )
        .await;

        Ok(())
    }

    /// Authority-side password reset. The new password is provided by Authority
    /// and returned ONCE in `ResetPasswordResponse` for the credential sheet.
    /// DOCTOR and ASSISTANT are NOT forced to change after a reset (`must_change_password = 0`).
    pub async fn reset_password(
        pool: &DbPool,
        id: &str,
        req: ResetPasswordRequest,
        actor_id: &str,
    ) -> Result<ResetPasswordResponse, AppError> {
        if req.new_password.len() < 6 {
            return Err(AppError::Validation("Password must be at least 6 characters".to_string()));
        }

        let pass_hash = hash_password(&req.new_password)?;
        let now_str = Utc::now().to_rfc3339();

        // must_change_password = 0: Doctor/Assistant are NOT forced to change after reset
        sqlx::query(
            "UPDATE users
             SET password_hash = ?, updated_at = ?, must_change_password = 0
             WHERE id = ?"
        )
        .bind(&pass_hash)
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        // Revoke all existing sessions to enforce re-login with new password
        sqlx::query("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
            .bind(&now_str)
            .bind(id)
            .execute(pool)
            .await?;

        let _ = AuditService::log_event(
            pool,
            None,
            Some(actor_id),
            "RESET_PASSWORD",
            Some("USER"),
            Some(id),
            None,
            serde_json::json!({}),
        )
        .await;

        Ok(ResetPasswordResponse {
            generated_password: req.new_password,
        })
    }
}
