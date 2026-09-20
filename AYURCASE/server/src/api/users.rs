use axum::{
    extract::{Path, Query, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::user::{
    CreateUserRequest, CreateUserResponse, ResetPasswordRequest, ResetPasswordResponse,
    UpdateUserRequest, UserSummary,
};
use crate::repositories::DbPool;
use crate::services::UserService;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct UserQuery {
    pub workspace_id: Option<String>,
}

pub async fn list_users(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Query(q): Query<UserQuery>,
) -> Result<Json<Vec<UserSummary>>, AppError> {
    if user.is_authority() {
        let users = UserService::list(&pool, q.workspace_id.as_deref()).await?;
        Ok(Json(users))
    } else {
        // Doctors and Assistants see users in their own workspace only
        let ws_id = user.workspace_id.as_deref().unwrap_or("");
        let users = UserService::list(&pool, Some(ws_id)).await?;
        Ok(Json(users))
    }
}

pub async fn create_user(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<CreateUserResponse>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let response = UserService::create(&pool, req, &user.user_id).await?;
    Ok(Json(response))
}

pub async fn update_user(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<UserSummary>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let updated = UserService::update(&pool, &id, req, &user.user_id).await?;
    Ok(Json(updated))
}

pub async fn deactivate_user(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    UserService::deactivate(&pool, &id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "User account deactivated" })))
}

pub async fn reset_user_password(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<ResetPasswordResponse>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let response = UserService::reset_password(&pool, &id, req, &user.user_id).await?;
    Ok(Json(response))
}
