use sixsense_server::{
    api::create_router, config::AppConfig, ensure_bootstrap_admin, init_pool, run_migrations,
    seed_initial_data_if_empty,
};
use std::net::SocketAddr;
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sixsense_server=debug,tower_http=debug".into()),
        )
        .init();

    info!("==========================================================");
    info!("Starting SIXSENSE Authoritative Central Server for AYURCASE");
    info!("Target Platform: macOS / Mac M5 Centralized LAN Host");
    info!("==========================================================");

    // 2. Load configuration
    let config = AppConfig::from_env();
    config.ensure_directories()?;
    info!("Application data directory: {:?}", config.data_dir);
    info!("Documents storage directory: {:?}", config.documents_dir);
    info!("Backups storage directory: {:?}", config.backups_dir);

    // 3. Initialize SQLite Connection Pool
    let pool = init_pool(&config.database_url).await?;
    info!("Connected to SQLite database: {}", config.database_url);

    // 4. Run Migrations, Seed Data, and ensure bootstrap Authority account
    run_migrations(&pool).await?;
    seed_initial_data_if_empty(&pool).await?;
    ensure_bootstrap_admin(&pool).await?;

    // 5. Build Router
    let app = create_router(pool);

    // 6. Bind Listener
    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let lan_ips = sixsense_server::api::server_manager::detect_lan_ips();
    info!("==========================================================");
    info!("SIXSENSE Server listening on http://{} (LAN enabled)", addr);
    for ip in &lan_ips {
        info!("  LAN Client Address: http://{}:{}", ip, config.port);
    }
    info!("  Management Console: http://localhost:{}/server-manager", config.port);
    info!("==========================================================");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("SIXSENSE Server shutdown complete.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received shutdown signal (Ctrl+C). Cleaning up...");
        },
        _ = terminate => {
            info!("Received terminate signal (SIGTERM). Cleaning up...");
        },
    }
}
