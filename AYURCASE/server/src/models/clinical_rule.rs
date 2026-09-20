use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct ClinicalRule {
    pub id: String,
    pub diagnosis_id: String,
    pub rule_code: String,
    pub version: i64,
    pub criteria_json: String,
    pub anupana: Option<String>,
    pub pathya: Option<String>,
    pub apathya: Option<String>,
    pub status: String,
    pub validated_by: Option<String>,
    pub validated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow)]
pub struct ClinicalRuleItem {
    pub id: String,
    pub rule_id: String,
    pub medicine_id: String,
    pub dosage_text: Option<String>,
    pub frequency_text: Option<String>,
    pub duration_text: Option<String>,
    pub instructions_text: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuleItemSuggestion {
    pub medicine_id: String,
    pub medicine_name: String,
    pub form: Option<String>,
    pub strength: Option<String>,
    pub dosage_text: Option<String>,
    pub frequency_text: Option<String>,
    pub duration_text: Option<String>,
    pub instructions_text: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ValidatedAssistanceResult {
    pub has_validated_rule: bool,
    pub diagnosis_id: String,
    pub diagnosis_name: String,
    pub rule_id: Option<String>,
    pub rule_code: Option<String>,
    pub version: Option<i64>,
    pub anupana: Option<String>,
    pub pathya: Option<String>,
    pub apathya: Option<String>,
    pub items: Vec<RuleItemSuggestion>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateRuleRequest {
    pub diagnosis_id: String,
    pub rule_code: String,
    pub version: i64,
    pub criteria_json: Option<String>,
    pub anupana: Option<String>,
    pub pathya: Option<String>,
    pub apathya: Option<String>,
    pub items: Vec<CreateRuleItemInput>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateRuleItemInput {
    pub medicine_id: String,
    pub dosage_text: Option<String>,
    pub frequency_text: Option<String>,
    pub duration_text: Option<String>,
    pub instructions_text: Option<String>,
}
