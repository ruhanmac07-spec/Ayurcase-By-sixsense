use axum::{
    extract::{Path, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::workspace::{CreateWorkspaceRequest, UpdateWorkspaceRequest, Workspace};
use crate::repositories::DbPool;
use crate::services::WorkspaceService;

pub async fn list_workspaces(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<Vec<Workspace>>, AppError> {
    // Authority sees all; Doctor/Assistant can see their own
    if user.is_authority() {
        let list = WorkspaceService::list(&pool).await?;
        Ok(Json(list))
    } else if let Some(ref ws_id) = user.workspace_id {
        let ws = WorkspaceService::get(&pool, ws_id).await?;
        Ok(Json(vec![ws]))
    } else {
        Ok(Json(vec![]))
    }
}

pub async fn create_workspace(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreateWorkspaceRequest>,
) -> Result<Json<Workspace>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let created = WorkspaceService::create(&pool, req, &user.user_id).await?;
    Ok(Json(created))
}

pub async fn update_workspace(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
    Json(req): Json<UpdateWorkspaceRequest>,
) -> Result<Json<Workspace>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let updated = WorkspaceService::update(&pool, &id, req, &user.user_id).await?;
    Ok(Json(updated))
}

pub async fn deactivate_workspace(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    WorkspaceService::deactivate(&pool, &id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Workspace deactivated" })))
}

pub async fn restore_workspace(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    WorkspaceService::restore(&pool, &id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Workspace restored" })))
}
