use axum::{extract::State, Json};
use crate::error::AppError;
use crate::repositories::DbPool;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: String,
    pub service: String,
    pub version: String,
    pub database: String,
}

pub async fn get_health(State(pool): State<DbPool>) -> Result<Json<HealthStatus>, AppError> {
    let db_status = match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => "CONNECTED".to_string(),
        Err(e) => format!("DISCONNECTED: {}", e),
    };

    Ok(Json(HealthStatus {
        status: "OK".to_string(),
        service: "SIXSENSE Server".to_string(),
        version: "1.0.0".to_string(),
        database: db_status,
    }))
}
