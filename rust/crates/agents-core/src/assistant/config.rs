//! The JSON columns on `Assistant` (`modelConfig`, `chatConfig`, `guardRails`, `memoryConfig`).
//!
//! Ported from `src/lib/types/assistant.ts`. The TypeScript accepted these as `z.unknown()`, so
//! any shape was stored. Here they are typed: unknown keys are ignored on read (old rows still
//! load) and ranges are checked on write by [`validate`]. Field names stay camelCase because the
//! columns and the UI share them.

use serde::{Deserialize, Serialize};

use crate::validation::FieldError;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MemoryConfig {
    pub enabled: bool,
    pub working_memory: bool,
    pub semantic_recall: bool,
    pub long_term_profile: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_instructions: Option<String>,
}

impl Default for MemoryConfig {
    /// Every flag defaults to on, as `runChat` did when the column was null.
    fn default() -> Self {
        Self {
            enabled: true,
            working_memory: true,
            semantic_recall: true,
            long_term_profile: true,
            memory_instructions: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResponseFormat {
    Default,
    Json,
    Markdown,
    Concise,
    Detailed,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ModelConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ResponseFormat>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChatConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_create_topic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_threshold: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_history: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_summary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_scroll: Option<bool>,
    /// `"auto"` or an artifact type id such as `"application/mermaid"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_canvas_mode: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolApproval {
    Off,
    /// Everything except read-only built-ins pauses for approval. The default.
    #[default]
    Risky,
    All,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GuardRailsConfig {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub blocked_topics: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_response_length: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub require_citations: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_approval: Option<ToolApproval>,
}

impl GuardRailsConfig {
    #[must_use]
    pub fn tool_approval(&self) -> ToolApproval {
        self.tool_approval.unwrap_or_default()
    }
}

fn check_range(errors: &mut Vec<FieldError>, field: &str, value: Option<f64>, min: f64, max: f64) {
    if let Some(v) = value
        && !(v.is_finite() && (min..=max).contains(&v))
    {
        errors.push(FieldError::new(
            field,
            "out_of_range",
            format!("Must be between {min} and {max}."),
        ));
    }
}

/// Range checks for `modelConfig`. The serde types already reject wrong types and enum values.
#[must_use]
pub fn validate_model_config(config: &ModelConfig, pointer: &str) -> Vec<FieldError> {
    let mut errors = Vec::new();
    check_range(
        &mut errors,
        &format!("{pointer}/temperature"),
        config.temperature,
        0.0,
        2.0,
    );
    check_range(
        &mut errors,
        &format!("{pointer}/topP"),
        config.top_p,
        0.0,
        1.0,
    );
    check_range(
        &mut errors,
        &format!("{pointer}/presencePenalty"),
        config.presence_penalty,
        -2.0,
        2.0,
    );
    check_range(
        &mut errors,
        &format!("{pointer}/frequencyPenalty"),
        config.frequency_penalty,
        -2.0,
        2.0,
    );
    if config.max_tokens == Some(0) {
        errors.push(FieldError::new(
            format!("{pointer}/maxTokens"),
            "out_of_range",
            "Must be at least 1.",
        ));
    }
    errors
}

#[cfg(test)]
mod tests {
    use super::*;

    type R = Result<(), serde_json::Error>;

    #[test]
    fn null_memory_config_means_everything_on() -> R {
        let c: MemoryConfig = serde_json::from_str("{}")?;
        assert!(c.enabled && c.working_memory && c.semantic_recall && c.long_term_profile);
        Ok(())
    }

    #[test]
    fn unknown_keys_in_old_rows_are_ignored() -> R {
        let c: GuardRailsConfig = serde_json::from_str(r#"{"blockedTopics":["x"],"legacy":1}"#)?;
        assert_eq!(c.blocked_topics, vec!["x".to_owned()]);
        assert_eq!(c.tool_approval(), ToolApproval::Risky);
        Ok(())
    }

    #[test]
    fn model_config_ranges() {
        let c = ModelConfig {
            temperature: Some(2.5),
            top_p: Some(f64::NAN),
            ..ModelConfig::default()
        };
        let errs = validate_model_config(&c, "/modelConfig");
        assert_eq!(errs.len(), 2);
        assert_eq!(
            errs.first().map(|e| e.field.as_str()),
            Some("/modelConfig/temperature")
        );
    }
}
