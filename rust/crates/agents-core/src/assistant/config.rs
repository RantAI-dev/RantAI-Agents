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

impl MemoryConfig {
    /// Reads the column the way `runChat` did: a flag that is not `false` is on, and a field
    /// of the wrong type leaves the flag alone.
    ///
    /// A row written before the column was typed still loads: nothing is rejected, a field that
    /// cannot be read is simply not there.
    #[must_use]
    pub fn from_json(value: &serde_json::Value) -> Self {
        let flag = |key: &str| value.get(key) != Some(&serde_json::Value::Bool(false));
        Self {
            enabled: flag("enabled"),
            working_memory: flag("workingMemory"),
            semantic_recall: flag("semanticRecall"),
            long_term_profile: flag("longTermProfile"),
            memory_instructions: value
                .get("memoryInstructions")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned),
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

impl ResponseFormat {
    /// The name the column carries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Json => "json",
            Self::Markdown => "markdown",
            Self::Concise => "concise",
            Self::Detailed => "detailed",
        }
    }
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

impl ModelConfig {
    /// Reads the column leniently: a field of the wrong type is left out, not an error.
    ///
    /// A row written before the column was typed still works: the parts that can be read are
    /// used, the rest are as if they were never set.
    #[must_use]
    pub fn from_json(value: &serde_json::Value) -> Self {
        let number = |key: &str| value.get(key).and_then(serde_json::Value::as_f64);
        let count = |key: &str| {
            value
                .get(key)
                .and_then(serde_json::Value::as_u64)
                .and_then(|number| u32::try_from(number).ok())
        };
        Self {
            temperature: number("temperature"),
            top_p: number("topP"),
            max_tokens: count("maxTokens"),
            presence_penalty: number("presencePenalty"),
            frequency_penalty: number("frequencyPenalty"),
            reasoning_effort: value
                .get("reasoningEffort")
                .and_then(|value| serde_json::from_value(value.clone()).ok()),
            response_format: value
                .get("responseFormat")
                .and_then(|value| serde_json::from_value(value.clone()).ok()),
        }
    }
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

    #[test]
    fn a_field_of_the_wrong_type_is_left_out() {
        let c = ModelConfig::from_json(&serde_json::json!({
            "temperature": "hot",
            "topP": 0.9,
            "maxTokens": 256,
            "responseFormat": "json",
        }));
        assert_eq!(c.temperature, None);
        assert_eq!(c.top_p, Some(0.9));
        assert_eq!(c.max_tokens, Some(256));
        assert_eq!(c.response_format, Some(ResponseFormat::Json));
    }

    #[test]
    fn the_memory_flags_are_on_unless_they_are_false() {
        let c =
            MemoryConfig::from_json(&serde_json::json!({"enabled": false, "semanticRecall": 1}));
        assert!(!c.enabled);
        assert!(c.semantic_recall);
        assert!(c.long_term_profile);
        let c = MemoryConfig::from_json(&serde_json::json!({}));
        assert!(c.enabled && c.working_memory && c.semantic_recall && c.long_term_profile);
    }
}
