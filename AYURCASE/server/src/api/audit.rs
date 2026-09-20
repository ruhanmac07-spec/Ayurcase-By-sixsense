use axum::{
    extract::{Query, State},
    Json,
};
use crate::api::middleware::Authenticated;
use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::audit::AuditLogEntry;
use crate::repositories::DbPool;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct AuditQuery {
    pub workspace_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_audit_logs(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Query(q): Query<AuditQuery>,
) -> Result<Json<Vec<AuditLogEntry>>, AppError> {
    user.require_role(&["AUTHORITY"])?;

    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);

    let logs = AuditService::list_logs(&pool, q.workspace_id.as_deref(), limit, offset).await?;
    Ok(Json(logs))
}
