use crate::audit::AuditService;
use crate::error::AppError;
use crate::models::workspace::{CreateWorkspaceRequest, UpdateWorkspaceRequest, Workspace};
use crate::repositories::DbPool;
use chrono::Utc;
use uuid::Uuid;

pub struct WorkspaceService;

impl WorkspaceService {
    pub async fn list(pool: &DbPool) -> Result<Vec<Workspace>, AppError> {
        let workspaces = sqlx::query_as(
            "SELECT id, code, name, description, status, created_at, updated_at, deactivated_at
             FROM workspaces
             ORDER BY created_at ASC"
        )
        .fetch_all(pool)
        .await?;

        Ok(workspaces)
    }

    pub async fn get(pool: &DbPool, id: &str) -> Result<Workspace, AppError> {
        let ws: Option<Workspace> = sqlx::query_as(
            "SELECT id, code, name, description, status, created_at, updated_at, deactivated_at
             FROM workspaces WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        ws.ok_or_else(|| AppError::NotFound(format!("Workspace '{}' not found", id)))
    }

    pub async fn create(
        pool: &DbPool,
        req: CreateWorkspaceRequest,
        actor_id: &str,
    ) -> Result<Workspace, AppError> {
        if req.code.trim().is_empty() || req.name.trim().is_empty() {
            return Err(AppError::Validation("Workspace code and name are required".to_string()));
        }

        let existing: Option<(String,)> = sqlx::query_as("SELECT id FROM workspaces WHERE code = ?")
            .bind(&req.code)
            .fetch_optional(pool)
            .await?;

        if existing.is_some() {
            return Err(AppError::Conflict(format!(
                "Workspace with code '{}' already exists",
                req.code
            )));
        }

        let id = format!("ws_{}", Uuid::now_v7());
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO workspaces (id, code, name, description, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)"
        )
        .bind(&id)
        .bind(&req.code.to_uppercase())
        .bind(&req.name)
        .bind(&req.description)
        .bind(&now_str)
        .bind(&now_str)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            Some(&id),
            Some(actor_id),
            "CREATE_WORKSPACE",
            Some("WORKSPACE"),
            Some(&id),
            None,
            serde_json::json!({ "code": req.code, "name": req.name }),
        )
        .await;

        // Automatically and idempotently create department folder on server
        let _ = crate::services::storage_service::PatientStorageService::ensure_department_folder(&req.name);

        Self::get(pool, &id).await
    }

    pub async fn update(
        pool: &DbPool,
        id: &str,
        req: UpdateWorkspaceRequest,
        actor_id: &str,
    ) -> Result<Workspace, AppError> {
        let ws = Self::get(pool, id).await?;
        let name = req.name.unwrap_or(ws.name);
        let description = req.description.or(ws.description);
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "UPDATE workspaces 
             SET name = ?, description = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&name)
        .bind(&description)
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            Some(id),
            Some(actor_id),
            "UPDATE_WORKSPACE",
            Some("WORKSPACE"),
            Some(id),
            None,
            serde_json::json!({ "name": name }),
        )
        .await;

        Self::get(pool, id).await
    }

    pub async fn deactivate(pool: &DbPool, id: &str, actor_id: &str) -> Result<(), AppError> {
        let _ = Self::get(pool, id).await?;
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "UPDATE workspaces 
             SET status = 'DEACTIVATED', deactivated_at = ?, updated_at = ?
             WHERE id = ?"
        )
        .bind(&now_str)
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        // Immediately revoke all active sessions belonging to users in this workspace
        sqlx::query(
            "UPDATE sessions 
             SET revoked_at = ? 
             WHERE user_id IN (SELECT id FROM users WHERE workspace_id = ?) 
               AND revoked_at IS NULL"
        )
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            Some(id),
            Some(actor_id),
            "DEACTIVATE_WORKSPACE",
            Some("WORKSPACE"),
            Some(id),
            None,
            serde_json::json!({}),
        )
        .await;

        Ok(())
    }

    pub async fn restore(pool: &DbPool, id: &str, actor_id: &str) -> Result<(), AppError> {
        let _ = Self::get(pool, id).await?;
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "UPDATE workspaces 
             SET status = 'ACTIVE', deactivated_at = NULL, updated_at = ?
             WHERE id = ?"
        )
        .bind(&now_str)
        .bind(id)
        .execute(pool)
        .await?;

        let _ = AuditService::log_event(
            pool,
            Some(id),
            Some(actor_id),
            "RESTORE_WORKSPACE",
            Some("WORKSPACE"),
            Some(id),
            None,
            serde_json::json!({}),
        )
        .await;

        Ok(())
    }
}
