use axum::{
    extract::{Path, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::queue::{DoctorQueueItem, TransferVisitRequest};
use crate::repositories::DbPool;
use crate::services::QueueService;

pub async fn get_my_queue(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<Vec<DoctorQueueItem>>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;
    let ws_id = user.workspace_id.as_deref().unwrap_or("ws_kayachikitsa");

    let queue = QueueService::get_doctor_queue(&pool, &user.user_id, ws_id).await?;
    Ok(Json(queue))
}

pub async fn get_intake_snapshot(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
) -> Result<Json<Vec<DoctorQueueItem>>, AppError> {
    let ws_id = user.workspace_id.as_deref().unwrap_or("ws_kayachikitsa");
    let queue = QueueService::get_intake_snapshot(&pool, ws_id).await?;
    Ok(Json(queue))
}

pub async fn call_patient(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(queue_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["DOCTOR"])?;
    QueueService::call_patient(&pool, &queue_id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Patient called" })))
}

pub async fn start_consultation(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["DOCTOR"])?;
    QueueService::start_consultation(&pool, &visit_id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Consultation started" })))
}

pub async fn transfer_patient(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
    Json(req): Json<TransferVisitRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;
    QueueService::transfer_patient(&pool, &visit_id, &req.target_doctor_id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Patient transferred to doctor queue" })))
}
