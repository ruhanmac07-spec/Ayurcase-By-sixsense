use crate::error::AppError;
use crate::models::clinical_rule::{ClinicalRule, RuleItemSuggestion, ValidatedAssistanceResult};
use crate::repositories::DbPool;

pub struct ClinicalRuleEngine;

impl ClinicalRuleEngine {
    pub async fn evaluate_diagnosis(
        pool: &DbPool,
        diagnosis_id: &str,
    ) -> Result<ValidatedAssistanceResult, AppError> {
        // 1. Get diagnosis name
        let diag_row: Option<(String, String)> = sqlx::query_as(
            "SELECT id, name FROM diagnosis_catalog WHERE id = ?"
        )
        .bind(diagnosis_id)
        .fetch_optional(pool)
        .await?;

        let (diag_id, diag_name) = match diag_row {
            Some(row) => row,
            None => {
                return Err(AppError::NotFound(format!(
                    "Diagnosis catalogue ID '{}' not found",
                    diagnosis_id
                )))
            }
        };

        // 2. Query for active validated rule matching diagnosis_id
        let rule: Option<ClinicalRule> = sqlx::query_as(
            "SELECT id, diagnosis_id, rule_code, version, criteria_json, anupana, pathya, apathya, status, validated_by, validated_at, created_at, updated_at
             FROM clinical_rules
             WHERE diagnosis_id = ? AND status = 'ACTIVE'
             ORDER BY version DESC
             LIMIT 1"
        )
        .bind(&diag_id)
        .fetch_optional(pool)
        .await?;

        match rule {
            Some(r) => {
                // Fetch rule items with medicine details
                let items: Vec<(String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
                    "SELECT cri.medicine_id, m.name, m.form, m.strength, cri.dosage_text, cri.frequency_text, cri.duration_text, cri.instructions_text
                     FROM clinical_rule_items cri
                     JOIN medicines m ON m.id = cri.medicine_id
                     WHERE cri.rule_id = ?"
                )
                .bind(&r.id)
                .fetch_all(pool)
                .await?;

                let suggestion_items = items
                    .into_iter()
                    .map(|(med_id, name, form, strength, dosage, freq, dur, inst)| {
                        RuleItemSuggestion {
                            medicine_id: med_id,
                            medicine_name: name,
                            form,
                            strength,
                            dosage_text: dosage,
                            frequency_text: freq,
                            duration_text: dur,
                            instructions_text: inst,
                        }
                    })
                    .collect();

                Ok(ValidatedAssistanceResult {
                    has_validated_rule: true,
                    diagnosis_id: diag_id,
                    diagnosis_name: diag_name,
                    rule_id: Some(r.id),
                    rule_code: Some(r.rule_code),
                    version: Some(r.version),
                    anupana: r.anupana,
                    pathya: r.pathya,
                    apathya: r.apathya,
                    items: suggestion_items,
                    message: None,
                })
            }
            None => {
                // Deterministic fallback: Calm, explicit state when no validated rule exists.
                Ok(ValidatedAssistanceResult {
                    has_validated_rule: false,
                    diagnosis_id: diag_id,
                    diagnosis_name: diag_name,
                    rule_id: None,
                    rule_code: None,
                    version: None,
                    anupana: None,
                    pathya: None,
                    apathya: None,
                    items: Vec::new(),
                    message: Some("No validated recommendation available for this diagnosis.".to_string()),
                })
            }
        }
    }
}
