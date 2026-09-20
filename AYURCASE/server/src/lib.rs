pub mod api;
pub mod audit;
pub mod auth;
pub mod authorization;
pub mod backup;
pub mod config;
pub mod documents;
pub mod error;
pub mod models;
pub mod repositories;
pub mod rules;
pub mod services;

pub use config::AppConfig;
pub use error::AppError;
pub use repositories::{ensure_bootstrap_admin, init_pool, run_migrations, seed_initial_data_if_empty, seed_clinical_datasets_if_empty, DbPool};

