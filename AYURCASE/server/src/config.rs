use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub data_dir: PathBuf,
    pub documents_dir: PathBuf,
    pub patient_data_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub session_ttl_hours: i64,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let host = std::env::var("SIXSENSE_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port: u16 = std::env::var("SIXSENSE_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8443);

        let data_dir = std::env::var("SIXSENSE_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                #[cfg(target_os = "macos")]
                {
                    if let Some(mut home) = dirs_or_home() {
                        home.push("Library/Application Support/SIXSENSE");
                        return home;
                    }
                }
                PathBuf::from("./sixsense_data")
            });

        let patient_data_dir = std::env::var("SIXSENSE_PATIENT_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| data_dir.join("Patient Data"));
        let documents_dir = patient_data_dir.clone();
        let backups_dir = data_dir.join("backups");
        let db_path = data_dir.join("central_ayurcase.db");

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| format!("sqlite://{}?mode=rwc", db_path.to_string_lossy()));

        let session_ttl_hours = std::env::var("SIXSENSE_SESSION_TTL_HOURS")
            .ok()
            .and_then(|h| h.parse().ok())
            .unwrap_or(8);

        Self {
            host,
            port,
            database_url,
            data_dir,
            documents_dir,
            patient_data_dir,
            backups_dir,
            session_ttl_hours,
        }
    }

    pub fn ensure_directories(&self) -> Result<(), std::io::Error> {
        std::fs::create_dir_all(&self.data_dir)?;
        std::fs::create_dir_all(&self.patient_data_dir)?;
        std::fs::create_dir_all(&self.backups_dir)?;
        Ok(())
    }
}

fn dirs_or_home() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}
