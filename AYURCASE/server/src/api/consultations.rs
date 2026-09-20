use axum::{
    extract::{Path, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::diagnosis::{AttachDiagnosisRequest, VisitDiagnosisDetail};
use crate::repositories::DbPool;
use crate::services::{ConsultationService, PrescriptionService, VisitService};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct SaveClinicalNotesRequest {
    pub chief_complaint: Option<String>,
    pub complaints_list: Option<Vec<crate::models::visit::VisitComplaintItem>>,
    pub history_text: Option<String>,
    pub past_history: Option<String>,
    pub family_history: Option<String>,
    pub personal_history: Option<String>,
    pub ayush_data_json: Option<String>,
    pub schema_version: Option<String>,
}

pub async fn get_consultation_workspace(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;
    let visit_detail = VisitService::get_detail(&pool, &visit_id).await?;
    user.require_workspace(&visit_detail.visit.workspace_id)?;

    let diagnoses = ConsultationService::get_diagnoses(&pool, &visit_id).await?;
    let prescription = PrescriptionService::get_detail(&pool, &visit_id).await?;

    Ok(Json(serde_json::json!({
        "visit_detail": visit_detail,
        "diagnoses": diagnoses,
        "prescription": prescription,
    })))
}

pub async fn save_clinical_notes(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
    Json(req): Json<SaveClinicalNotesRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["DOCTOR"])?;
    let visit = VisitService::get_visit(&pool, &visit_id).await?;
    user.require_workspace(&visit.workspace_id)?;
    user.require_doctor_match(&visit.doctor_id)?;

    if visit.status == "FINALIZED" || visit.status == "CANCELLED" {
        return Err(AppError::Forbidden(format!(
            "Clinical encounter is {} and sealed against modification",
            visit.status
        )));
    }

    ConsultationService::save_clinical_notes(
        &pool,
        &visit_id,
        req.chief_complaint,
        req.history_text,
        req.past_history,
        req.family_history,
        req.personal_history,
        req.ayush_data_json,
        req.schema_version,
        &user.user_id,
        req.complaints_list,
    )
    .await?;

    Ok(Json(serde_json::json!({ "success": true, "message": "Clinical notes saved" })))
}

pub async fn attach_diagnosis(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
    Json(req): Json<AttachDiagnosisRequest>,
) -> Result<Json<VisitDiagnosisDetail>, AppError> {
    user.require_role(&["DOCTOR"])?;
    let visit = VisitService::get_visit(&pool, &visit_id).await?;
    user.require_workspace(&visit.workspace_id)?;
    user.require_doctor_match(&visit.doctor_id)?;

    if visit.status == "FINALIZED" || visit.status == "CANCELLED" {
        return Err(AppError::Forbidden(format!(
            "Clinical encounter is {} and sealed against modification",
            visit.status
        )));
    }

    let attached = ConsultationService::attach_diagnosis(&pool, &visit_id, req, &user.user_id).await?;
    Ok(Json(attached))
}

pub async fn remove_diagnosis(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path((visit_id, diagnosis_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["DOCTOR"])?;
    let visit = VisitService::get_visit(&pool, &visit_id).await?;
    user.require_workspace(&visit.workspace_id)?;
    user.require_doctor_match(&visit.doctor_id)?;

    if visit.status == "FINALIZED" || visit.status == "CANCELLED" {
        return Err(AppError::Forbidden(format!(
            "Clinical encounter is {} and sealed against modification",
            visit.status
        )));
    }

    ConsultationService::remove_diagnosis(&pool, &visit_id, &diagnosis_id, &user.user_id).await?;
    Ok(Json(serde_json::json!({ "success": true, "message": "Diagnosis removed" })))
}

pub async fn get_diagnoses(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<Vec<VisitDiagnosisDetail>>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY", "ASSISTANT"])?;
    let visit = VisitService::get_visit(&pool, &visit_id).await?;
    user.require_workspace(&visit.workspace_id)?;

    let list = ConsultationService::get_diagnoses(&pool, &visit_id).await?;
    Ok(Json(list))
}
