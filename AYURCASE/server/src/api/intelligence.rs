use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::api::middleware::Authenticated;
use crate::error::AppError;
use crate::repositories::DbPool;
use crate::services::intelligence_service::{
    HistoricalCase, IntelligenceService, ObservationalAnalytics,
};

#[derive(Deserialize)]
pub struct SimilarCasesQuery {
    pub workspace_id: Option<String>,
    pub query: Option<String>,
    pub exclude_visit_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct PatternAnalyticsQuery {
    pub workspace_id: Option<String>,
}

pub async fn search_similar_cases(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Query(params): Query<SimilarCasesQuery>,
) -> Result<Json<Vec<HistoricalCase>>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;

    let ws_id = match params.workspace_id {
        Some(ref ws) => {
            user.require_workspace(ws)?;
            ws.as_str()
        }
        None => user
            .workspace_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("Workspace ID is required".to_string()))?,
    };

    let query_str = params.query.unwrap_or_default();
    let limit = params.limit.unwrap_or(10).clamp(1, 50);

    let cases = IntelligenceService::search_similar_cases(
        &pool,
        ws_id,
        &query_str,
        params.exclude_visit_id.as_deref(),
        limit,
    )
    .await?;

    Ok(Json(cases))
}

pub async fn get_pattern_analytics(
    State(pool): State<DbPool>,
    Authenticated(user): Authenticated,
    Query(params): Query<PatternAnalyticsQuery>,
) -> Result<Json<ObservationalAnalytics>, AppError> {
    user.require_role(&["DOCTOR", "AUTHORITY"])?;

    let ws_id = match params.workspace_id {
        Some(ref ws) => {
            user.require_workspace(ws)?;
            ws.as_str()
        }
        None => user
            .workspace_id
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("Workspace ID is required".to_string()))?,
    };

    let analytics = IntelligenceService::get_pattern_analytics(&pool, ws_id).await?;

    Ok(Json(analytics))
}
