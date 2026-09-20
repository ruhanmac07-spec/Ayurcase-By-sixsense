use axum::{
    extract::{Path, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::prescription::{PrescriptionDetail, SavePrescriptionDraftRequest};
use crate::repositories::DbPool;
use crate::services::{PrescriptionService, VisitService};

pub async fn get_prescription(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<Option<PrescriptionDetail>>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY", "ASSISTANT"])?;
    let visit = VisitService::get_visit(&pool, &visit_id).await?;
    user.require_workspace(&visit.workspace_id)?;

    let rx = PrescriptionService::get_detail(&pool, &visit_id).await?;
    Ok(Json(rx))
}

pub async fn save_prescription_draft(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
    Json(req): Json<SavePrescriptionDraftRequest>,
) -> Result<Json<PrescriptionDetail>, AppError> {
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

    let detail = PrescriptionService::save_draft(&pool, &visit_id, req, &user.user_id).await?;
    Ok(Json(detail))
}

pub async fn finalize_prescription(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<PrescriptionDetail>, AppError> {
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

    let detail = PrescriptionService::finalize_prescription(&pool, &visit_id, &user.user_id).await?;
    Ok(Json(detail))
}
