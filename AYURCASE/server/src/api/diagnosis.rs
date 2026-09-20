use axum::{
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::models::clinical_rule::{CreateRuleRequest, ValidatedAssistanceResult};
use crate::models::diagnosis::{CreateDiagnosisRequest, DiagnosisCatalog};
use crate::models::medicine::{
    ClinicalReference, CreateMedicineRequest, CsvCommitRequest, CsvCommitResponse,
    CsvPreviewResponse, Medicine, MedicineSearchQuery, MedicineSearchResult,
    UpdateMedicineRequest,
};
use crate::repositories::DbPool;
use crate::rules::ClinicalRuleEngine;
use crate::services::MedicineService;
use chrono::Utc;
use uuid::Uuid;

pub async fn list_catalog(
    State(pool): State<DbPool>,
    Authenticated(_user): Authenticated,
) -> Result<Json<Vec<DiagnosisCatalog>>, AppError> {
    let list = sqlx::query_as(
        "SELECT id, code, name, description, status, created_at, updated_at
         FROM diagnosis_catalog
         ORDER BY name ASC"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(list))
}

pub async fn search_catalog(
    State(pool): State<DbPool>,
    Authenticated(_user): Authenticated,
    Query(query): Query<crate::models::diagnosis::DiagnosisSearchQuery>,
) -> Result<Json<Vec<DiagnosisCatalog>>, AppError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let q_term = query.q.as_deref().unwrap_or("").trim();

    let list: Vec<DiagnosisCatalog> = if q_term.is_empty() {
        sqlx::query_as(
            "SELECT id, code, name, description, status, created_at, updated_at
             FROM diagnosis_catalog
             WHERE status = 'ACTIVE'
             ORDER BY name ASC
             LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&pool)
        .await?
    } else {
        let pattern = format!("%{}%", q_term);
        sqlx::query_as(
            "SELECT id, code, name, description, status, created_at, updated_at
             FROM diagnosis_catalog
             WHERE status = 'ACTIVE' AND (
                 LOWER(name) LIKE LOWER(?) OR
                 LOWER(code) LIKE LOWER(?) OR
                 (description IS NOT NULL AND LOWER(description) LIKE LOWER(?))
             )
             ORDER BY 
                 CASE 
                     WHEN LOWER(code) = LOWER(?) THEN 1
                     WHEN LOWER(name) = LOWER(?) THEN 2
                     WHEN LOWER(code) LIKE LOWER(?) || '%' THEN 3
                     WHEN LOWER(name) LIKE LOWER(?) || '%' THEN 4
                     ELSE 5
                 END,
                 name ASC
             LIMIT ?"
        )
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(q_term)
        .bind(q_term)
        .bind(q_term)
        .bind(q_term)
        .bind(limit)
        .fetch_all(&pool)
        .await?
    };

    Ok(Json(list))
}

pub async fn create_catalog_entry(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreateDiagnosisRequest>,
) -> Result<Json<DiagnosisCatalog>, AppError> {
    user.require_role(&["AUTHORITY"])?;

    let id = format!("diag_{}", Uuid::now_v7());
    let now_str = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO diagnosis_catalog (id, code, name, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)"
    )
    .bind(&id)
    .bind(&req.code.to_uppercase())
    .bind(&req.name)
    .bind(&req.description)
    .bind(&now_str)
    .bind(&now_str)
    .execute(&pool)
    .await?;

    let item = sqlx::query_as(
        "SELECT id, code, name, description, status, created_at, updated_at
         FROM diagnosis_catalog WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(item))
}

pub async fn list_medicines(
    State(pool): State<DbPool>,
    Authenticated(_user): Authenticated,
) -> Result<Json<Vec<Medicine>>, AppError> {
    let list = sqlx::query_as(
        "SELECT id, code, name, name_hi, form, strength, description, status, created_at, updated_at
         FROM medicines
         ORDER BY name ASC"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(list))
}

pub async fn create_medicine(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreateMedicineRequest>,
) -> Result<Json<Medicine>, AppError> {
    user.require_role(&["AUTHORITY"])?;

    let id = format!("med_{}", Uuid::now_v7());
    let now_str = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)"
    )
    .bind(&id)
    .bind(&req.code.to_uppercase())
    .bind(&req.name)
    .bind(&req.name_hi)
    .bind(&req.form)
    .bind(&req.strength)
    .bind(&req.description)
    .bind(&now_str)
    .bind(&now_str)
    .execute(&pool)
    .await?;

    let item = sqlx::query_as(
        "SELECT id, code, name, name_hi, form, strength, description, status, created_at, updated_at
         FROM medicines WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(item))
}

pub async fn update_medicine(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
    Json(req): Json<UpdateMedicineRequest>,
) -> Result<Json<Medicine>, AppError> {
    user.require_role(&["AUTHORITY"])?;

    let existing: Medicine = sqlx::query_as(
        "SELECT id, code, name, name_hi, form, strength, description, status, created_at, updated_at
         FROM medicines WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Medicine '{}' not found", id)))?;

    let name = req.name.unwrap_or(existing.name);
    let name_hi = if req.name_hi.is_some() { req.name_hi } else { existing.name_hi };
    let form = if req.form.is_some() { req.form } else { existing.form };
    let strength = if req.strength.is_some() { req.strength } else { existing.strength };
    let description = if req.description.is_some() { req.description } else { existing.description };
    let status = req.status.unwrap_or(existing.status);
    let now_str = Utc::now().to_rfc3339();

    sqlx::query(
        "UPDATE medicines 
         SET name = ?, name_hi = ?, form = ?, strength = ?, description = ?, status = ?, updated_at = ?
         WHERE id = ?"
    )
    .bind(&name)
    .bind(&name_hi)
    .bind(&form)
    .bind(&strength)
    .bind(&description)
    .bind(&status)
    .bind(&now_str)
    .bind(&id)
    .execute(&pool)
    .await?;

    let item = sqlx::query_as(
        "SELECT id, code, name, name_hi, form, strength, description, status, created_at, updated_at
         FROM medicines WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(item))
}

pub async fn get_validated_assistance(
    State(pool): State<DbPool>,
    Authenticated(_user): Authenticated,
    Path(diagnosis_id): Path<String>,
) -> Result<Json<ValidatedAssistanceResult>, AppError> {
    let result = ClinicalRuleEngine::evaluate_diagnosis(&pool, &diagnosis_id).await?;
    Ok(Json(result))
}

pub async fn create_clinical_rule(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CreateRuleRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    user.require_role(&["AUTHORITY"])?;

    let mut tx = pool.begin().await?;
    let rule_id = format!("rule_{}", Uuid::now_v7());
    let criteria = req.criteria_json.unwrap_or_else(|| "{}".to_string());
    let now_str = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO clinical_rules (id, diagnosis_id, rule_code, version, criteria_json, anupana, pathya, apathya, status, validated_by, validated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)"
    )
    .bind(&rule_id)
    .bind(&req.diagnosis_id)
    .bind(&req.rule_code.to_uppercase())
    .bind(req.version)
    .bind(&criteria)
    .bind(&req.anupana)
    .bind(&req.pathya)
    .bind(&req.apathya)
    .bind(&user.user_id)
    .bind(&now_str)
    .bind(&now_str)
    .bind(&now_str)
    .execute(&mut *tx)
    .await?;

    for item in req.items {
        let item_id = format!("cri_{}", Uuid::now_v7());
        sqlx::query(
            "INSERT INTO clinical_rule_items (id, rule_id, medicine_id, dosage_text, frequency_text, duration_text, instructions_text)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item_id)
        .bind(&rule_id)
        .bind(&item.medicine_id)
        .bind(&item.dosage_text)
        .bind(&item.frequency_text)
        .bind(&item.duration_text)
        .bind(&item.instructions_text)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "rule_id": rule_id,
        "message": "Validated clinical rule created successfully"
    })))
}

#[derive(serde::Deserialize)]
pub struct PreviewCsvPayload {
    pub csv_content: String,
    pub csv_type: Option<String>,
}

pub async fn search_medicines_endpoint(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Query(query): Query<MedicineSearchQuery>,
) -> Result<Json<Vec<MedicineSearchResult>>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;
    let results = MedicineService::search_medicines(
        &pool,
        query.q.as_deref(),
        query.limit.unwrap_or(25),
    )
    .await?;
    Ok(Json(results))
}

pub async fn get_medicine_references_endpoint(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(medicine_id): Path<String>,
) -> Result<Json<Vec<ClinicalReference>>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;
    let refs = MedicineService::get_references_for_medicine(&pool, &medicine_id).await?;
    Ok(Json(refs))
}

pub async fn download_csv_template_endpoint(
    Authenticated(user): Authenticated,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Response, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let template_type = params.get("type").map(|s| s.as_str()).unwrap_or("medicine_master");
    let (filename, content) = MedicineService::generate_csv_template(template_type);

    let headers = [
        (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
        (
            header::CONTENT_DISPOSITION,
            &format!("attachment; filename=\"{}\"", filename),
        ),
    ];

    Ok((headers, content).into_response())
}

pub async fn preview_csv_endpoint(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(payload): Json<PreviewCsvPayload>,
) -> Result<Json<CsvPreviewResponse>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let preview = MedicineService::validate_and_preview_csv(
        &pool,
        &payload.csv_content,
        payload.csv_type.as_deref(),
    )
    .await?;
    Ok(Json(preview))
}

pub async fn commit_csv_endpoint(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Json(req): Json<CsvCommitRequest>,
) -> Result<Json<CsvCommitResponse>, AppError> {
    user.require_role(&["AUTHORITY"])?;
    let res = MedicineService::commit_csv_import(
        &pool,
        req,
        user.workspace_id.as_deref(),
        Some(&user.user_id),
    )
    .await?;
    Ok(Json(res))
}

