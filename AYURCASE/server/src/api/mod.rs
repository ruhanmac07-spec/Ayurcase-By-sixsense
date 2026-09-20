pub mod audit;
pub mod auth;
pub mod backups;
pub mod consultations;
pub mod diagnosis;
pub mod documents;
pub mod health;
pub mod intelligence;
pub mod middleware;
pub mod patients;
pub mod prescriptions;
pub mod queue;
pub mod users;
pub mod visits;
pub mod workspaces;
pub mod server_manager;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use crate::repositories::DbPool;

pub fn create_router(pool: DbPool) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_routes = Router::new()
        // Health
        .route("/health", get(health::get_health))
        // Auth
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/session", get(auth::get_current_session))
        .route("/auth/change-password", post(auth::change_password))
        // Workspaces
        .route("/workspaces", get(workspaces::list_workspaces).post(workspaces::create_workspace))
        .route("/workspaces/:id", put(workspaces::update_workspace))
        .route("/workspaces/:id/deactivate", post(workspaces::deactivate_workspace))
        .route("/workspaces/:id/restore", post(workspaces::restore_workspace))
        // Users
        .route("/users", get(users::list_users).post(users::create_user))
        .route("/users/:id", put(users::update_user))
        .route("/users/:id/deactivate", post(users::deactivate_user))
        .route("/users/:id/reset-password", post(users::reset_user_password))
        // Patients
        .route("/patients/search", get(patients::search_patients))
        .route("/patients/check-duplicates", post(patients::check_duplicates))
        .route("/patients", post(patients::create_patient))
        .route("/patients/:id", get(patients::get_patient).put(patients::update_patient))
        .route("/patients/:id/history", get(patients::get_patient_history))
        // Visits
        .route("/visits", post(visits::create_visit_intake))
        .route("/visits/:id", get(visits::get_visit))
        // Queue
        .route("/queue/my-queue", get(queue::get_my_queue))
        .route("/queue/intake-snapshot", get(queue::get_intake_snapshot))
        .route("/queue/:id/call", post(queue::call_patient))
        .route("/queue/:visit_id/start", post(queue::start_consultation))
        .route("/queue/:visit_id/transfer", post(queue::transfer_patient))
        // Consultations
        .route("/consultations/:visit_id", get(consultations::get_consultation_workspace))
        .route("/consultations/:visit_id/notes", put(consultations::save_clinical_notes))
        .route("/consultations/:visit_id/diagnosis", post(consultations::attach_diagnosis))
        .route("/consultations/:visit_id/diagnosis/:diagnosis_id", delete(consultations::remove_diagnosis))
        .route("/consultations/:visit_id/diagnoses", get(consultations::get_diagnoses))
        // Diagnosis & Medicines Master Catalog & Clinical Rules
        .route("/diagnosis/catalog", get(diagnosis::list_catalog).post(diagnosis::create_catalog_entry))
        .route("/diagnosis/catalog/search", get(diagnosis::search_catalog))
        .route("/diagnosis/medicines", get(diagnosis::list_medicines).post(diagnosis::create_medicine))
        .route("/diagnosis/medicines/search", get(diagnosis::search_medicines_endpoint))
        .route("/diagnosis/medicines/template", get(diagnosis::download_csv_template_endpoint))
        .route("/diagnosis/medicines/import/preview", post(diagnosis::preview_csv_endpoint))
        .route("/diagnosis/medicines/import/commit", post(diagnosis::commit_csv_endpoint))
        .route("/diagnosis/medicines/:id", put(diagnosis::update_medicine))
        .route("/diagnosis/medicines/:id/references", get(diagnosis::get_medicine_references_endpoint))
        .route("/diagnosis/rules/:diagnosis_id", get(diagnosis::get_validated_assistance))
        .route("/diagnosis/rules", post(diagnosis::create_clinical_rule))
        // Prescriptions
        .route("/prescriptions/:visit_id", get(prescriptions::get_prescription).put(prescriptions::save_prescription_draft))
        .route("/prescriptions/:visit_id/finalize", post(prescriptions::finalize_prescription))
        // Documents
        .route("/documents/generate-case-sheet/:visit_id", post(documents::generate_case_sheet))
        .route("/documents/generate-prescription/:visit_id", post(documents::generate_prescription))
        .route("/documents/:id/download", get(documents::download_document))
        // Intelligence & Observational Analytics (Strictly Read-Only)
        .route("/intelligence/similar-cases", get(intelligence::search_similar_cases))
        .route("/intelligence/pattern-analytics", get(intelligence::get_pattern_analytics))
        // Audit
        .route("/audit/logs", get(audit::list_audit_logs))
        // Backups
        .route("/backups", get(backups::list_backups))
        .route("/backups/run", post(backups::trigger_backup))
        .route("/backups/export-data", get(backups::export_backup_data))
        .route("/backups/:id/verify", post(backups::verify_backup))
        // Server Management Status & Operations
        .route("/server-manager/status", get(server_manager::get_server_manager_status))
        .route("/server-manager/backup", post(server_manager::trigger_server_manager_backup));

    Router::new()
        .route("/server-manager", get(server_manager::get_server_manager_html))
        .nest("/api/v1", api_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(pool)
}
