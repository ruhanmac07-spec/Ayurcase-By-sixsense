use crate::error::AppError;
use crate::models::audit::AuditLogEntry;
use crate::repositories::DbPool;
use uuid::Uuid;

pub struct AuditService;

impl AuditService {
    pub async fn log_event(
        pool: &DbPool,
        workspace_id: Option<&str>,
        user_id: Option<&str>,
        action: &str,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
        request_id: Option<&str>,
        details: serde_json::Value,
    ) -> Result<(), AppError> {
        let id = format!("aud_{}", Uuid::now_v7());
        let details_str = serde_json::to_string(&details).unwrap_or_else(|_| "{}".to_string());

        sqlx::query(
            "INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, request_id, details_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(workspace_id)
        .bind(user_id)
        .bind(action)
        .bind(entity_type)
        .bind(entity_id)
        .bind(request_id)
        .bind(&details_str)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn list_logs(
        pool: &DbPool,
        workspace_id: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditLogEntry>, AppError> {
        let query = if let Some(ws_id) = workspace_id {
            sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>, Option<String>, String, Option<String>, Option<String>, String, String)>(
                "SELECT a.id, a.workspace_id, w.name, a.user_id, u.username, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at
                 FROM audit_logs a
                 LEFT JOIN workspaces w ON w.id = a.workspace_id
                 LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.workspace_id = ?
                 ORDER BY a.created_at DESC
                 LIMIT ? OFFSET ?"
            )
            .bind(ws_id)
            .bind(limit)
            .bind(offset)
        } else {
            sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>, Option<String>, String, Option<String>, Option<String>, String, String)>(
                "SELECT a.id, a.workspace_id, w.name, a.user_id, u.username, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at
                 FROM audit_logs a
                 LEFT JOIN workspaces w ON w.id = a.workspace_id
                 LEFT JOIN users u ON u.id = a.user_id
                 ORDER BY a.created_at DESC
                 LIMIT ? OFFSET ?"
            )
            .bind(limit)
            .bind(offset)
        };

        let rows = query.fetch_all(pool).await?;

        let entries = rows
            .into_iter()
            .map(|(id, ws_id, ws_name, u_id, username, action, ent_type, ent_id, details, created)| {
                AuditLogEntry {
                    id,
                    workspace_id: ws_id,
                    workspace_name: ws_name,
                    user_id: u_id,
                    username,
                    action,
                    entity_type: ent_type,
                    entity_id: ent_id,
                    details_json: details,
                    created_at: created,
                }
            })
            .collect();

        Ok(entries)
    }
}
