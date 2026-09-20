use crate::config::AppConfig;
use crate::error::AppError;
use std::path::{Path, PathBuf};

pub struct PatientStorageService;

impl PatientStorageService {
    /// Sanitizes any segment name (Department, Doctor, Patient Code, or file name)
    /// to prevent path traversal (e.g. `../`, `/`, `\`), null bytes, or invalid characters.
    pub fn sanitize_segment(input: &str) -> String {
        let mut result = String::with_capacity(input.len());
        let mut last_was_space = false;
        for c in input.chars() {
            if c == '/' || c == '\\' || c == '\0' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' || c.is_control() {
                if !last_was_space {
                    result.push('_');
                    last_was_space = true;
                }
            } else {
                result.push(c);
                last_was_space = c == ' ' || c == '_';
            }
        }
        let no_dots = result.replace("..", "_");
        let trimmed = no_dots.trim_matches(|c| c == ' ' || c == '.' || c == '-' || c == '_');
        if trimmed.is_empty() {
            "General".to_string()
        } else {
            trimmed.to_string()
        }
    }

    /// Returns the root Patient Data directory from configuration.
    pub fn get_patient_data_root() -> PathBuf {
        let config = AppConfig::from_env();
        config.patient_data_dir
    }

    /// Validates that `target` is safely contained within `base` (preventing directory traversal).
    fn validate_contained(base: &Path, target: &Path) -> Result<(), AppError> {
        let relative = target.strip_prefix(base).map_err(|_| {
            AppError::Validation("Path resolution error: target not inside root".to_string())
        })?;
        for comp in relative.components() {
            if comp == std::path::Component::ParentDir {
                return Err(AppError::Validation("Path traversal attempt detected".to_string()));
            }
        }
        Ok(())
    }

    /// Automatically and idempotently ensures the Department folder exists:
    /// `Patient Data/<Department>/`
    pub fn ensure_department_folder(dept_name: &str) -> Result<PathBuf, AppError> {
        let root = Self::get_patient_data_root();
        let dept_clean = Self::sanitize_segment(dept_name);
        let dept_dir = root.join(&dept_clean);

        Self::validate_contained(&root, &dept_dir)?;
        std::fs::create_dir_all(&dept_dir).map_err(|e| {
            AppError::Internal(format!("Failed to create department folder '{}': {}", dept_clean, e))
        })?;

        Ok(dept_dir)
    }

    /// Automatically and idempotently ensures the Doctor folder exists:
    /// `Patient Data/<Department>/<Doctor>/`
    pub fn ensure_doctor_folder(dept_name: &str, doctor_name: &str) -> Result<PathBuf, AppError> {
        let dept_dir = Self::ensure_department_folder(dept_name)?;
        let doctor_clean = Self::sanitize_segment(doctor_name);
        let doctor_dir = dept_dir.join(&doctor_clean);

        let root = Self::get_patient_data_root();
        Self::validate_contained(&root, &doctor_dir)?;

        std::fs::create_dir_all(&doctor_dir).map_err(|e| {
            AppError::Internal(format!("Failed to create doctor folder '{}': {}", doctor_clean, e))
        })?;

        Ok(doctor_dir)
    }

    /// Automatically and idempotently ensures the Patient Code folder exists:
    /// `Patient Data/<Department>/<Doctor>/<Patient Code>/`
    pub fn ensure_patient_folder(
        dept_name: &str,
        doctor_name: &str,
        patient_code: &str,
    ) -> Result<PathBuf, AppError> {
        let doctor_dir = Self::ensure_doctor_folder(dept_name, doctor_name)?;
        let code_clean = Self::sanitize_segment(patient_code);
        let patient_dir = doctor_dir.join(&code_clean);

        let root = Self::get_patient_data_root();
        Self::validate_contained(&root, &patient_dir)?;

        std::fs::create_dir_all(&patient_dir).map_err(|e| {
            AppError::Internal(format!("Failed to create patient code folder '{}': {}", code_clean, e))
        })?;

        Ok(patient_dir)
    }

    /// Resolves the expected Patient Code folder path.
    pub fn get_patient_folder(
        dept_name: &str,
        doctor_name: &str,
        patient_code: &str,
    ) -> Result<PathBuf, AppError> {
        let root = Self::get_patient_data_root();
        let dept_clean = Self::sanitize_segment(dept_name);
        let doctor_clean = Self::sanitize_segment(doctor_name);
        let code_clean = Self::sanitize_segment(patient_code);

        let path = root.join(&dept_clean).join(&doctor_clean).join(&code_clean);
        Self::validate_contained(&root, &path)?;
        Ok(path)
    }

    /// Resolves the expected Department folder path.
    pub fn get_department_folder(dept_name: &str) -> Result<PathBuf, AppError> {
        let root = Self::get_patient_data_root();
        let dept_clean = Self::sanitize_segment(dept_name);
        let path = root.join(&dept_clean);
        Self::validate_contained(&root, &path)?;
        Ok(path)
    }

    /// Resolves the expected Doctor folder path.
    pub fn get_doctor_folder(dept_name: &str, doctor_name: &str) -> Result<PathBuf, AppError> {
        let root = Self::get_patient_data_root();
        let dept_clean = Self::sanitize_segment(dept_name);
        let doctor_clean = Self::sanitize_segment(doctor_name);
        let path = root.join(&dept_clean).join(&doctor_clean);
        Self::validate_contained(&root, &path)?;
        Ok(path)
    }
}
