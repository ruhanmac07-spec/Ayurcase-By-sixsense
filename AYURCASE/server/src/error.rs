use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Authentication required")]
    Unauthorized(String),

    #[error("Forbidden: insufficient permissions")]
    Forbidden(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Internal server error: {0}")]
    Internal(String),
}

#[derive(Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
pub struct ApiErrorEnvelope {
    pub success: bool,
    pub error: ErrorDetail,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
            AppError::Validation(msg) => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", msg.clone()),
            AppError::Database(err) => {
                tracing::error!("Database query error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "DATABASE_ERROR", format!("Database error: {}", err))
            }
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", msg.clone())
            }
        };

        let body = Json(ApiErrorEnvelope {
            success: false,
            error: ErrorDetail {
                code: code.to_string(),
                message,
                details: None,
            },
        });

        (status, body).into_response()
    }
}
