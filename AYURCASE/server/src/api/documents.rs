use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::header,
    response::Response,
    Json,
};
use crate::api::middleware::Authenticated;
use crate::config::AppConfig;
use crate::documents::DocumentService;
use crate::error::AppError;
use crate::models::document::Document;
use crate::repositories::DbPool;
use serde::Deserialize;
use std::fs::File;
use std::io::Read;

#[derive(Clone)]
pub struct DocumentState {
    pub pool: DbPool,
    pub config: AppConfig,
}

#[derive(Deserialize, Default)]
pub struct DownloadQuery {
    pub format: Option<String>,
    pub download: Option<bool>,
}

pub async fn generate_case_sheet(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<Document>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;

    // Enforce workspace-level authorization
    let visit_ws: Option<(String,)> = sqlx::query_as("SELECT workspace_id FROM visits WHERE id = ?")
        .bind(&visit_id)
        .fetch_optional(&pool)
        .await?;
    let (ws_id,) = visit_ws.ok_or_else(|| AppError::NotFound(format!("Visit '{}' not found", visit_id)))?;
    user.require_workspace(&ws_id)?;

    let config = AppConfig::from_env();

    let doc = DocumentService::generate_case_sheet(
        &pool,
        &config.documents_dir,
        &visit_id,
        &user.user_id,
    )
    .await?;

    Ok(Json(doc))
}

pub async fn generate_prescription(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(visit_id): Path<String>,
) -> Result<Json<Document>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;

    // Enforce workspace-level authorization
    let visit_ws: Option<(String,)> = sqlx::query_as("SELECT workspace_id FROM visits WHERE id = ?")
        .bind(&visit_id)
        .fetch_optional(&pool)
        .await?;
    let (ws_id,) = visit_ws.ok_or_else(|| AppError::NotFound(format!("Visit '{}' not found", visit_id)))?;
    user.require_workspace(&ws_id)?;

    let config = AppConfig::from_env();

    let doc = DocumentService::generate_prescription(
        &pool,
        &config.documents_dir,
        &visit_id,
        &user.user_id,
    )
    .await?;

    Ok(Json(doc))
}

pub async fn download_document(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Path(id): Path<String>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, AppError> {
    let doc: Option<Document> = sqlx::query_as(
        "SELECT id, visit_id, document_type, file_path, file_hash, generated_by, generated_at
         FROM documents WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?;

    let d = doc.ok_or_else(|| AppError::NotFound(format!("Document '{}' not found", id)))?;

    // Enforce workspace-level authorization on document access
    let visit_ws: Option<(String,)> = sqlx::query_as("SELECT workspace_id FROM visits WHERE id = ?")
        .bind(&d.visit_id)
        .fetch_optional(&pool)
        .await?;
    if let Some((ws_id,)) = visit_ws {
        user.require_workspace(&ws_id)?;
    }

    // If HTML format is explicitly requested (e.g. for preview modal or browser printing)
    if query.format.as_deref() == Some("html") {
        let html_content = DocumentService::render_document_html(&pool, &d.id).await?;
        let response = Response::builder()
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_DISPOSITION, "inline")
            .body(Body::from(html_content))
            .map_err(|e| AppError::Internal(format!("Failed to build HTML response: {}", e)))?;
        return Ok(response);
    }

    // Documents are stored as PDF. Direct file_path is the source of truth.
    let target_read_path = d.file_path.clone();

    let mut file = File::open(&target_read_path)
        .map_err(|e| AppError::NotFound(format!("File on server not accessible: {}", e)))?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .map_err(|e| AppError::Internal(format!("Failed to read document: {}", e)))?;

    if contents.is_empty() {
        return Err(AppError::Internal("Document file is empty (0 bytes)".to_string()));
    }

    let is_html = target_read_path.ends_with(".html");
    if !is_html && !contents.starts_with(b"%PDF-") {
        return Err(AppError::Internal("Document file is corrupted or not a valid PDF".to_string()));
    }

    let content_type = if is_html {
        "text/html; charset=utf-8"
    } else {
        "application/pdf"
    };

    let filename = std::path::Path::new(&target_read_path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if is_html {
                format!("{}_{}.html", d.document_type.to_lowercase(), d.id)
            } else {
                format!("{}_{}.pdf", d.document_type.to_lowercase(), d.id)
            }
        });

    let disposition = if query.download.unwrap_or(false) {
        format!("attachment; filename=\"{}\"", filename)
    } else {
        format!("inline; filename=\"{}\"", filename)
    };

    let response = Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(contents))
        .map_err(|e| AppError::Internal(format!("Failed to build document response: {}", e)))?;

    Ok(response)
}
