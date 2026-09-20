use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use crate::authorization::AuthUser;
use crate::error::AppError;
use crate::repositories::DbPool;
use crate::services::AuthService;

pub struct Authenticated(pub AuthUser);

#[async_trait]
impl<S> FromRequestParts<S> for Authenticated
where
    DbPool: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let pool = DbPool::from_ref(state);

        // 1. Try Authorization header (Bearer <token>)
        let token = if let Some(auth_header) = parts.headers.get("Authorization") {
            let val = auth_header.to_str().map_err(|_| {
                AppError::Unauthorized("Invalid Authorization header format".to_string())
            })?;
            if let Some(tok) = val.strip_prefix("Bearer ") {
                tok.trim().to_string()
            } else {
                val.trim().to_string()
            }
        } else if let Some(tok_header) = parts.headers.get("X-Session-Token") {
            tok_header
                .to_str()
                .map_err(|_| AppError::Unauthorized("Invalid X-Session-Token".to_string()))?
                .trim()
                .to_string()
        } else {
            return Err(AppError::Unauthorized("Missing authentication token".to_string()));
        };

        let user = AuthService::validate_session(&pool, &token).await?;
        Ok(Authenticated(user))
    }
}
