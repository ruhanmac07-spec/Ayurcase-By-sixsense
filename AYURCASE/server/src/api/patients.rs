use axum::{
    extract::{Path, Query, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::patient::{CreatePatientRequest, DuplicateCheckResult, Patient, UpdatePatientRequest};
use crate::repositories::DbPool;
use crate::services::{PatientService, VisitService};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct PatientSearchQuery {
    pub q: Option<String>,
    pub workspace_id: Option<String>,
}

#[derive(Deserialize)]
pub struct DuplicateCheckPayload {
    pub phone: Option<String>,
    pub full_name: String,
    pub workspace_id: Option<String>,
}

pub async fn search_patients(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Query(q): Query<PatientSearchQuery>,
) -> Result<Json<Vec<Patient>>, AppError> {
    let ws_id = if user.is_authority() {
        q.workspace_id
            .or(user.workspace_id)
            .unwrap_or_else(|| "ws_kayachikitsa".to_string())
    } else {
        user.workspace_id
            .ok_or_else(|| AppError::Forbidden("No workspace assigned".to_string()))?
    };

    let query_str = q.q.unwrap_or_default();
    let results = PatientService::search(&pool, &ws_id, &query_str).await?;
    Ok(Json(results))
}

pub async fn check_duplicates(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(payload): Json<DuplicateCheckPayload>,
) -> Result<Json<DuplicateCheckResult>, AppError> {
    let ws_id = if user.is_authority() {
        payload
            .workspace_id
            .or(user.workspace_id)
            .unwrap_or_else(|| "ws_kayachikitsa".to_string())
    } else {
        user.workspace_id
            .ok_or_else(|| AppError::Forbidden("No workspace assigned".to_string()))?
    };

    let res = PatientService::check_duplicates(
        &pool,
        &ws_id,
        payload.phone.as_deref(),
        &payload.full_name,
    )
    .await?;

    Ok(Json(res))
}

pub async fn get_patient(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<Patient>, AppError> {
    let patient = PatientService::get(&pool, &id).await?;
    user.require_workspace(&patient.workspace_id)?;
    Ok(Json(patient))
}

pub async fn create_patient(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreatePatientRequest>,
) -> Result<Json<Patient>, AppError> {
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

    let created = PatientService::create(&pool, &ws_id, req, &user.user_id).await?;
    Ok(Json(created))
}

pub async fn update_patient(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
    Json(req): Json<UpdatePatientRequest>,
) -> Result<Json<Patient>, AppError> {
    let existing = PatientService::get(&pool, &id).await?;
    user.require_workspace(&existing.workspace_id)?;

    let updated = PatientService::update(&pool, &id, req, &user.user_id).await?;
    Ok(Json(updated))
}

pub async fn get_patient_history(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let patient = PatientService::get(&pool, &id).await?;
    user.require_workspace(&patient.workspace_id)?;

    let history = VisitService::get_patient_history(&pool, &id).await?;
    Ok(Json(history))
}
