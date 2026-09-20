use axum::{
    extract::{Path, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::visit::{CreateVisitIntakeRequest, VisitDetailResponse};
use crate::repositories::DbPool;
use crate::services::VisitService;

pub async fn create_visit_intake(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreateVisitIntakeRequest>,
) -> Result<Json<VisitDetailResponse>, AppError> {
    let ws_id = if user.is_authority() {
        req.workspace_id
            .clone()
            .or(user.workspace_id)
            .unwrap_or_else(|| "ws_kayachikitsa".to_string())
    } else {
        user.workspace_id
            .clone()
            .ok_or_else(|| AppError::Forbidden("No workspace assigned".to_string()))?
    };

    let detail = VisitService::create_intake(&pool, &ws_id, req, &user.user_id).await?;
    Ok(Json(detail))
}

pub async fn get_visit(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<VisitDetailResponse>, AppError> {
    let detail = VisitService::get_detail(&pool, &id).await?;
    user.require_workspace(&detail.visit.workspace_id)?;
    Ok(Json(detail))
}
