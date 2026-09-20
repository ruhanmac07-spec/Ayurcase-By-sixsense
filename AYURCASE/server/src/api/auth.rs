use axum::{
    extract::State,
    http::HeaderMap,
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::session::{ChangePasswordRequest, LoginRequest, LoginResponse, UserSessionProfile};
use crate::models::workspace::Workspace;
use crate::repositories::DbPool;
use crate::services::AuthService;

pub async fn login(
    State(pool): State<DbPool>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let res = AuthService::login(&pool, req, 8).await?;
    Ok(Json(res))
}

pub async fn logout(
    State(pool): State<DbPool>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    if let Some(auth) = headers.get("Authorization") {
        if let Ok(val) = auth.to_str() {
            let tok = val.strip_prefix("Bearer ").unwrap_or(val).trim();
            AuthService::logout(&pool, tok).await?;
        }
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn get_current_session(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<UserSessionProfile>, AppError> {
    let ws: Option<Workspace> = if let Some(ref ws_id) = user.workspace_id {
        sqlx::query_as(
            "SELECT id, code, name, description, status, created_at, updated_at, deactivated_at
             FROM workspaces WHERE id = ?"
        )
        .bind(ws_id)
        .fetch_optional(&pool)
        .await?
    } else {
        None
    };

    let qual: Option<(Option<String>,)> = sqlx::query_as("SELECT qualification FROM users WHERE id = ?")
        .bind(&user.user_id)
        .fetch_optional(&pool)
        .await?;

    Ok(Json(UserSessionProfile {
        id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        workspace_id: user.workspace_id,
        workspace_name: ws.as_ref().map(|w| w.name.clone()),
        workspace_code: ws.as_ref().map(|w| w.code.clone()),
        qualification: qual.and_then(|q| q.0),
    }))
}

pub async fn change_password(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    AuthService::change_password(&pool, &user.user_id, &req.old_password, &req.new_password).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Password changed successfully" })))
}
