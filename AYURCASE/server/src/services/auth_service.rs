use crate::audit::AuditService;
use crate::auth::{generate_token, hash_password, hash_token, verify_password};
use crate::authorization::AuthUser;
use crate::error::AppError;
use crate::models::session::{LoginRequest, LoginResponse, UserSessionProfile};
use crate::models::user::User;
use crate::models::workspace::Workspace;
use crate::repositories::DbPool;
use chrono::{Duration, Utc};
use uuid::Uuid;

pub struct AuthService;

impl AuthService {
    pub async fn login(
        pool: &DbPool,
        req: LoginRequest,
        session_ttl_hours: i64,
    ) -> Result<LoginResponse, AppError> {
        let user: Option<User> = sqlx::query_as(
            "SELECT id, workspace_id, username, full_name, role, password_hash, status,
                    must_change_password, created_at, updated_at, last_login_at, deactivated_at, phone, qualification
             FROM users WHERE username = ?"
        )
        .bind(&req.username)
        .fetch_optional(pool)
        .await?;

        let u = match user {
            Some(u) => u,
            None => {
                let _ = AuditService::log_event(
                    pool,
                    None,
                    None,
                    "LOGIN_FAILED_USER_NOT_FOUND",
                    Some("USER"),
                    None,
                    None,
                    serde_json::json!({ "username": req.username }),
                )
                .await;
                return Err(AppError::Unauthorized("Invalid username or password".to_string()));
            }
        };

        if u.status != "ACTIVE" {
            let _ = AuditService::log_event(
                pool,
                u.workspace_id.as_deref(),
                Some(&u.id),
                "LOGIN_FAILED_DEACTIVATED",
                Some("USER"),
                Some(&u.id),
                None,
                serde_json::json!({ "username": req.username }),
            )
            .await;
            return Err(AppError::Forbidden("Account is deactivated".to_string()));
        }

        if u.role != "AUTHORITY" {
            if let Some(ref ws_id) = u.workspace_id {
                let ws_status: Option<(String,)> = sqlx::query_as("SELECT status FROM workspaces WHERE id = ?")
                    .bind(ws_id)
                    .fetch_optional(pool)
                    .await?;
                if let Some((st,)) = ws_status {
                    if st != "ACTIVE" {
                        return Err(AppError::Forbidden("Assigned workspace is deactivated".to_string()));
                    }
                }
            }
        }

        let is_valid = verify_password(&req.password, &u.password_hash)?;
        if !is_valid {
            let _ = AuditService::log_event(
                pool,
                u.workspace_id.as_deref(),
                Some(&u.id),
                "LOGIN_FAILED_WRONG_PASSWORD",
                Some("USER"),
                Some(&u.id),
                None,
                serde_json::json!({ "username": req.username }),
            )
            .await;
            return Err(AppError::Unauthorized("Invalid username or password".to_string()));
        }

        // Generate session token
        let raw_token = generate_token();
        let token_hash = hash_token(&raw_token);
        let session_id = format!("ses_{}", Uuid::now_v7());
        let expires_at = Utc::now() + Duration::hours(session_ttl_hours);

        sqlx::query(
            "INSERT INTO sessions (id, user_id, token_hash, expires_at)
             VALUES (?, ?, ?, ?)"
        )
        .bind(&session_id)
        .bind(&u.id)
        .bind(&token_hash)
        .bind(expires_at.to_rfc3339())
        .execute(pool)
        .await?;

        let now_str = Utc::now().to_rfc3339();
        sqlx::query("UPDATE users SET last_login_at = ? WHERE id = ?")
            .bind(&now_str)
            .bind(&u.id)
            .execute(pool)
            .await?;

        // Load workspace info if assigned
        let ws: Option<Workspace> = if let Some(ref ws_id) = u.workspace_id {
            sqlx::query_as(
                "SELECT id, code, name, description, status, created_at, updated_at, deactivated_at
                 FROM workspaces WHERE id = ?"
            )
            .bind(ws_id)
            .fetch_optional(pool)
            .await?
        } else {
            None
        };

        let profile = UserSessionProfile {
            id: u.id.clone(),
            username: u.username.clone(),
            full_name: u.full_name.clone(),
            role: u.role.clone(),
            workspace_id: u.workspace_id.clone(),
            workspace_name: ws.as_ref().map(|w| w.name.clone()),
            workspace_code: ws.as_ref().map(|w| w.code.clone()),
            qualification: u.qualification.clone(),
        };

        let _ = AuditService::log_event(
            pool,
            u.workspace_id.as_deref(),
            Some(&u.id),
            "LOGIN_SUCCESS",
            Some("USER"),
            Some(&u.id),
            None,
            serde_json::json!({ "username": u.username, "role": u.role }),
        )
        .await;

        // Signal to the frontend that this Authority account must change its default password.
        // This is ONLY ever true for AUTHORITY accounts with must_change_password = 1.
        // DOCTOR and ASSISTANT are never forced to change — they choose when to do so.
        let must_change_password = u.role == "AUTHORITY" && u.must_change_password != 0;

        Ok(LoginResponse {
            token: raw_token,
            user: profile,
            must_change_password,
        })
    }

    pub async fn logout(pool: &DbPool, raw_token: &str) -> Result<(), AppError> {
        let token_hash = hash_token(raw_token);
        let now_str = Utc::now().to_rfc3339();

        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT id, user_id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL"
        )
        .bind(&token_hash)
        .fetch_optional(pool)
        .await?;

        if let Some((ses_id, u_id)) = row {
            sqlx::query("UPDATE sessions SET revoked_at = ? WHERE id = ?")
                .bind(&now_str)
                .bind(&ses_id)
                .execute(pool)
                .await?;

            let _ = AuditService::log_event(
                pool,
                None,
                Some(&u_id),
                "LOGOUT",
                Some("SESSION"),
                Some(&ses_id),
                None,
                serde_json::json!({}),
            )
            .await;
        }

        Ok(())
    }

    pub async fn validate_session(pool: &DbPool, raw_token: &str) -> Result<AuthUser, AppError> {
        let token_hash = hash_token(raw_token);
        let now_str = Utc::now().to_rfc3339();

        let row: Option<(String, String, String, String, String, Option<String>, String, Option<String>)> = sqlx::query_as(
            "SELECT s.id, u.id, u.username, u.full_name, u.role, u.workspace_id, u.status, w.status
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN workspaces w ON w.id = u.workspace_id
             WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL"
        )
        .bind(&token_hash)
        .bind(&now_str)
        .fetch_optional(pool)
        .await?;

        let (ses_id, u_id, username, full_name, role, workspace_id, status, ws_status) = match row {
            Some(data) => data,
            None => return Err(AppError::Unauthorized("Invalid or expired session".to_string())),
        };

        if status != "ACTIVE" {
            return Err(AppError::Unauthorized("Account is deactivated".to_string()));
        }

        if role != "AUTHORITY" {
            if let Some(w_st) = ws_status {
                if w_st != "ACTIVE" {
                    return Err(AppError::Forbidden("Assigned workspace is deactivated".to_string()));
                }
            }
        }

        // Update last_seen_at
        let _ = sqlx::query("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
            .bind(&now_str)
            .bind(&ses_id)
            .execute(pool)
            .await;

        Ok(AuthUser {
            user_id: u_id,
            username,
            full_name,
            role,
            workspace_id,
            session_id: ses_id,
        })
    }

    pub async fn change_password(
        pool: &DbPool,
        user_id: &str,
        old_pass: &str,
        new_pass: &str,
    ) -> Result<(), AppError> {
        let user: Option<User> = sqlx::query_as(
            "SELECT id, workspace_id, username, full_name, role, password_hash, status,
                    must_change_password, created_at, updated_at, last_login_at, deactivated_at, phone, qualification
             FROM users WHERE id = ?"
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        let u = match user {
            Some(u) => u,
            None => return Err(AppError::NotFound("User not found".to_string())),
        };

        if !verify_password(old_pass, &u.password_hash)? {
            return Err(AppError::BadRequest("Current password does not match".to_string()));
        }

        if new_pass.len() < 6 {
            return Err(AppError::Validation("New password must be at least 6 characters".to_string()));
        }

        let new_hash = hash_password(new_pass)?;
        let now_str = Utc::now().to_rfc3339();

        // Update password and clear the forced-change flag
        sqlx::query("UPDATE users SET password_hash = ?, updated_at = ?, must_change_password = 0 WHERE id = ?")
            .bind(&new_hash)
            .bind(&now_str)
            .bind(user_id)
            .execute(pool)
            .await?;

        // Revoke ALL other sessions so the user must re-authenticate on other devices
        sqlx::query(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
        )
        .bind(&now_str)
        .bind(user_id)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            u.workspace_id.as_deref(),
            Some(user_id),
            "CHANGE_PASSWORD",
            Some("USER"),
            Some(user_id),
            None,
            serde_json::json!({}),
        )
        .await;

        Ok(())
    }
}
