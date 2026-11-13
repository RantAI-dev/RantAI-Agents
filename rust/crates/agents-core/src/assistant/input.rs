//! The create/update request bodies and their validation.
//!
//! Ported from `src/features/assistants/core/schema.ts` (zod, `.strict()`) plus the JSON
//! config checks from `assistant/config.rs`. Everything the old schema checked is checked
//! here with the same JSON Pointer paths; the JSON configs, which the old code accepted as
//! `z.unknown()`, are now typed and range-checked (see `docs/port/differences.md`).
//!
//! The zod version behind the old schema counts string length in UTF-16 code units, so the
//! limits here do too (`crate::memory::text::utf16_len`). The completeness module used
//! `.length` directly, so it counts the same way.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::assistant::config::{
    ModelConfig, ReasoningEffort, ResponseFormat, validate_model_config,
};
use crate::memory::text::utf16_len;
use crate::validation::FieldError;

/// A field that is `null` in the request: `Some(None)` is an explicit `null`, `None` is an
/// absent key. The derived `Option<Option<T>>` cannot tell them apart, so the old zod
/// `.nullable().optional()` shape needs this standard pair of serde helpers.
mod double_option {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn deserialize<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
    where
        T: Deserialize<'de>,
        D: Deserializer<'de>,
    {
        // The key is present here (an absent key never reaches `deserialize_with`):
        // `null` deserializes to `None`, a value to `Some(value)`.
        Ok(Some(Option::<T>::deserialize(deserializer)?))
    }

    pub fn serialize<T, S>(value: &Option<Option<T>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Serialize,
        S: Serializer,
    {
        match value {
            Some(None) => serializer.serialize_none(),
            Some(Some(inner)) => serializer.serialize_some(inner),
            // An absent key is skipped before this runs (skip_serializing_if).
            None => serializer.serialize_none(),
        }
    }
}

/// A nullable string field: `None` = absent, `Some(None)` = `null`, `Some(Some(text))`.
pub type NullableString = Option<Option<String>>;

/// The request types keep every shape the old zod schema accepted and reject the rest:
/// unknown keys (`.strict()`), wrong types and out-of-range config values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssistantCreate {
    pub name: String,
    pub system_prompt: String,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: NullableString,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub emoji: NullableString,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub model: NullableString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_knowledge_base: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_base_group_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_chat_enabled: Option<bool>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub memory_config: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub model_config: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub opening_message: NullableString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opening_questions: Option<Vec<String>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub chat_config: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub guard_rails: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub avatar_s3_key: NullableString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

/// `AssistantCreate` with every field optional.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssistantUpdate {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: NullableString,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub emoji: NullableString,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub model: NullableString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_knowledge_base: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_base_group_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_chat_enabled: Option<bool>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub memory_config: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub model_config: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub opening_message: NullableString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opening_questions: Option<Vec<String>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub chat_config: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub guard_rails: Option<Option<Value>>,
    #[serde(
        default,
        with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub avatar_s3_key: NullableString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

/// The system prompt minimum, in code points.
const SYSTEM_PROMPT_MINIMUM: usize = 20;

const KNOWN_FIELDS: [&str; 16] = [
    "name",
    "description",
    "emoji",
    "systemPrompt",
    "model",
    "useKnowledgeBase",
    "knowledgeBaseGroupIds",
    "memoryConfig",
    "liveChatEnabled",
    "modelConfig",
    "openingMessage",
    "openingQuestions",
    "chatConfig",
    "guardRails",
    "avatarS3Key",
    "tags",
];

/// Validates a create body and returns every failing field, at JSON Pointer paths.
///
/// Takes the raw body so unknown keys and wrong types are reported exactly as the old
/// `.strict()` schema reported them.
#[must_use]
pub fn validate_create_value(body: &Value) -> Vec<FieldError> {
    validate_body(body, true)
}

/// Validates an update body.
#[must_use]
pub fn validate_update_value(body: &Value) -> Vec<FieldError> {
    validate_body(body, false)
}

/// Validates a parsed create request.
#[must_use]
pub fn validate_create(input: &AssistantCreate) -> Vec<FieldError> {
    to_value_or_internal_error(input, validate_create_value)
}

/// Validates a parsed update request.
#[must_use]
pub fn validate_update(input: &AssistantUpdate) -> Vec<FieldError> {
    to_value_or_internal_error(input, validate_update_value)
}

fn to_value_or_internal_error<T: Serialize>(
    input: &T,
    validate: fn(&Value) -> Vec<FieldError>,
) -> Vec<FieldError> {
    match serde_json::to_value(input) {
        Ok(value) => validate(&value),
        Err(_) => vec![FieldError::new(
            "",
            "invalid_request",
            "The request could not be read.",
        )],
    }
}

fn validate_body(body: &Value, create: bool) -> Vec<FieldError> {
    let mut errors = Vec::new();
    let Some(fields) = body.as_object() else {
        errors.push(FieldError::new("", "invalid_type", "Expected an object."));
        return errors;
    };

    if create {
        required_string(&mut errors, fields, "name", 1);
        required_string(&mut errors, fields, "systemPrompt", SYSTEM_PROMPT_MINIMUM);
    } else {
        limited_string(&mut errors, fields, "name", 1);
        limited_string(&mut errors, fields, "systemPrompt", SYSTEM_PROMPT_MINIMUM);
    }
    limited_string(&mut errors, fields, "emoji", 1);
    limited_string(&mut errors, fields, "model", 1);
    for key in ["description", "openingMessage", "avatarS3Key"] {
        nullable_string(&mut errors, fields, key);
    }
    for key in ["openingQuestions", "knowledgeBaseGroupIds", "tags"] {
        string_array(&mut errors, fields, key);
    }
    for key in ["useKnowledgeBase", "liveChatEnabled"] {
        boolean(&mut errors, fields, key);
    }
    config_fields(&mut errors, fields, "memoryConfig", ConfigKind::Memory);
    config_fields(&mut errors, fields, "modelConfig", ConfigKind::Model);
    config_fields(&mut errors, fields, "chatConfig", ConfigKind::Chat);
    config_fields(&mut errors, fields, "guardRails", ConfigKind::GuardRails);

    for key in fields.keys() {
        if !KNOWN_FIELDS.contains(&key.as_str()) {
            errors.push(FieldError::new(
                format!("/{key}"),
                "unknown_field",
                "Unknown field.",
            ));
        }
    }
    errors
}

fn required_string(
    errors: &mut Vec<FieldError>,
    fields: &serde_json::Map<String, Value>,
    key: &str,
    minimum: usize,
) {
    match fields.get(key) {
        None => errors.push(FieldError::new(format!("/{key}"), "required", "Required.")),
        Some(value) => check_string(errors, format!("/{key}"), value, minimum),
    }
}

fn limited_string(
    errors: &mut Vec<FieldError>,
    fields: &serde_json::Map<String, Value>,
    key: &str,
    minimum: usize,
) {
    if let Some(value) = fields.get(key) {
        check_string(errors, format!("/{key}"), value, minimum);
    }
}

fn nullable_string(
    errors: &mut Vec<FieldError>,
    fields: &serde_json::Map<String, Value>,
    key: &str,
) {
    let Some(value) = fields.get(key) else {
        return;
    };
    if value.is_null() {
        return;
    }
    check_string(errors, format!("/{key}"), value, 0);
}

fn check_string(errors: &mut Vec<FieldError>, path: String, value: &Value, minimum: usize) {
    match value {
        Value::String(text) => {
            // The old schema counted JavaScript `.length`: UTF-16 code units.
            if utf16_len(text) < minimum {
                errors.push(FieldError::new(
                    path,
                    "too_short",
                    if minimum == SYSTEM_PROMPT_MINIMUM {
                        "System prompt must be at least 20 characters".to_owned()
                    } else {
                        format!("Must be at least {minimum} character(s).")
                    },
                ));
            }
        }
        _ => errors.push(FieldError::new(path, "invalid_type", "Expected a string.")),
    }
}

fn string_array(errors: &mut Vec<FieldError>, fields: &serde_json::Map<String, Value>, key: &str) {
    let Some(value) = fields.get(key) else {
        return;
    };
    match value {
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                if !item.is_string() {
                    errors.push(FieldError::new(
                        format!("/{key}/{index}"),
                        "invalid_type",
                        "Expected a string.",
                    ));
                }
            }
        }
        _ => errors.push(FieldError::new(
            format!("/{key}"),
            "invalid_type",
            "Expected an array.",
        )),
    }
}

fn boolean(errors: &mut Vec<FieldError>, fields: &serde_json::Map<String, Value>, key: &str) {
    let Some(value) = fields.get(key) else {
        return;
    };
    if !value.is_boolean() {
        errors.push(FieldError::new(
            format!("/{key}"),
            "invalid_type",
            "Expected a boolean.",
        ));
    }
}

#[derive(Debug, Clone, Copy)]
enum ConfigKind {
    Memory,
    Model,
    Chat,
    GuardRails,
}

/// One of the four JSON config columns. Absent and `null` mean "not set"; anything else
/// must be a (now typed) object — the old code accepted it as `z.unknown()`.
fn config_fields(
    errors: &mut Vec<FieldError>,
    fields: &serde_json::Map<String, Value>,
    key: &str,
    kind: ConfigKind,
) {
    let Some(value) = fields.get(key) else {
        return;
    };
    if value.is_null() {
        return;
    }
    let Some(map) = value.as_object() else {
        errors.push(FieldError::new(
            format!("/{key}"),
            "invalid_type",
            "Expected an object or null.",
        ));
        return;
    };
    let prefix = format!("/{key}");
    match kind {
        ConfigKind::Memory => validate_memory_config(errors, &prefix, map),
        ConfigKind::Model => validate_model_config_value(errors, &prefix, map),
        ConfigKind::Chat => validate_chat_config(errors, &prefix, map),
        ConfigKind::GuardRails => validate_guard_rails_config(errors, &prefix, map),
    }
}

fn validate_memory_config(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
) {
    // Plain booleans: `null` is not "unset", it is the wrong type.
    for key in [
        "enabled",
        "workingMemory",
        "semanticRecall",
        "longTermProfile",
    ] {
        plain_boolean(errors, prefix, map, key);
    }
    optional_string_field(errors, prefix, map, "memoryInstructions");
}

fn validate_model_config_value(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
) {
    let temperature = number_field(errors, prefix, map, "temperature");
    let top_p = number_field(errors, prefix, map, "topP");
    let max_tokens = u32_field(errors, prefix, map, "maxTokens");
    let presence_penalty = number_field(errors, prefix, map, "presencePenalty");
    let frequency_penalty = number_field(errors, prefix, map, "frequencyPenalty");
    let reasoning_effort = enum_field(
        errors,
        prefix,
        map,
        "reasoningEffort",
        &["low", "medium", "high"],
    )
    .and_then(|name| serde_json::from_value::<ReasoningEffort>(Value::String(name)).ok());
    let response_format = enum_field(
        errors,
        prefix,
        map,
        "responseFormat",
        &["default", "json", "markdown", "concise", "detailed"],
    )
    .and_then(|name| serde_json::from_value::<ResponseFormat>(Value::String(name)).ok());

    // The types are checked above, so the typed struct must parse; the range checks live in
    // `config.rs` and must not be duplicated here.
    let config = ModelConfig {
        temperature,
        top_p,
        max_tokens,
        presence_penalty,
        frequency_penalty,
        reasoning_effort,
        response_format,
    };
    errors.extend(validate_model_config(&config, prefix));
}

fn validate_chat_config(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
) {
    for key in [
        "autoCreateTopic",
        "limitHistory",
        "autoSummary",
        "autoScroll",
    ] {
        optional_boolean(errors, prefix, map, key);
    }
    for key in ["messageThreshold", "historyCount"] {
        let _ = u32_field(errors, prefix, map, key);
    }
    optional_string_field(errors, prefix, map, "defaultCanvasMode");
}

fn validate_guard_rails_config(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
) {
    plain_string_array(errors, prefix, map, "blockedTopics");
    optional_string_field(errors, prefix, map, "safetyInstructions");
    let _ = u32_field(errors, prefix, map, "maxResponseLength");
    optional_boolean(errors, prefix, map, "requireCitations");
    enum_field(
        errors,
        prefix,
        map,
        "toolApproval",
        &["off", "risky", "all"],
    );
}

/// A boolean field that must be `true` or `false` when present (`null` is a type error).
fn plain_boolean(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
) {
    if let Some(value) = map.get(key)
        && !value.is_boolean()
    {
        errors.push(FieldError::new(
            format!("{prefix}/{key}"),
            "invalid_type",
            "Expected a boolean.",
        ));
    }
}

/// An optional boolean: absent or `null` mean unset.
fn optional_boolean(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
) {
    if let Some(value) = map.get(key)
        && !value.is_null()
        && !value.is_boolean()
    {
        errors.push(FieldError::new(
            format!("{prefix}/{key}"),
            "invalid_type",
            "Expected a boolean.",
        ));
    }
}

/// An optional string: absent or `null` mean unset.
fn optional_string_field(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
) {
    if let Some(value) = map.get(key)
        && !value.is_null()
        && !value.is_string()
    {
        errors.push(FieldError::new(
            format!("{prefix}/{key}"),
            "invalid_type",
            "Expected a string.",
        ));
    }
}

/// An optional number: absent or `null` mean unset.
fn number_field(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
) -> Option<f64> {
    let value = map.get(key)?;
    if value.is_null() {
        return None;
    }
    match value.as_f64() {
        Some(number) => Some(number),
        None => {
            errors.push(FieldError::new(
                format!("{prefix}/{key}"),
                "invalid_type",
                "Expected a number.",
            ));
            None
        }
    }
}

/// An optional non-negative integer, in `u32` range: absent or `null` mean unset.
fn u32_field(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
) -> Option<u32> {
    let number = number_field(errors, prefix, map, key)?;
    // A JSON `10` arrives as `10.0` through `as_f64`; a whole in-range float is an integer.
    if number.is_finite() && number >= 0.0 && number <= f64::from(u32::MAX) && number.fract() == 0.0
    {
        Some(number as u32)
    } else {
        errors.push(FieldError::new(
            format!("{prefix}/{key}"),
            "out_of_range",
            format!("Must be a whole number between 0 and {}.", u32::MAX),
        ));
        None
    }
}

/// An optional enum by name: absent or `null` mean unset; an unknown name is a value error.
fn enum_field(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
    allowed: &[&str],
) -> Option<String> {
    let value = map.get(key)?;
    if value.is_null() {
        return None;
    }
    match value.as_str() {
        Some(name) if allowed.contains(&name) => Some(name.to_owned()),
        _ => {
            errors.push(FieldError::new(
                format!("{prefix}/{key}"),
                "invalid_value",
                format!("Must be one of: {}.", allowed.join(", ")),
            ));
            None
        }
    }
}

/// An array of strings that must be present as an array when set (`null` is a type error).
fn plain_string_array(
    errors: &mut Vec<FieldError>,
    prefix: &str,
    map: &serde_json::Map<String, Value>,
    key: &str,
) {
    if let Some(value) = map.get(key)
        && !value.is_null()
        && !value.is_array()
    {
        errors.push(FieldError::new(
            format!("{prefix}/{key}"),
            "invalid_type",
            "Expected an array.",
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    type R = Result<(), serde_json::Error>;

    fn paths(errors: &[FieldError]) -> Vec<String> {
        errors.iter().map(|e| e.field.clone()).collect()
    }

    #[test]
    fn accepts_the_minimum_create_body() -> R {
        let input: AssistantCreate =
            serde_json::from_str(r#"{"name":"A","systemPrompt":"xxxxxxxxxxxxxxxxxxxx"}"#)?;
        assert!(validate_create(&input).is_empty());
        Ok(())
    }

    #[test]
    fn rejects_unknown_keys_like_zod_strict() -> R {
        let errors = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "xxxxxxxxxxxxxxxxxxxx",
            "extra": 1
        }));
        assert_eq!(paths(&errors), vec!["/extra".to_owned()]);
        Ok(())
    }

    #[test]
    fn rejects_a_short_system_prompt() -> R {
        let errors = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "xxxxxxxxxxxxxxxxxxx"
        }));
        assert_eq!(paths(&errors), vec!["/systemPrompt".to_owned()]);
        Ok(())
    }

    #[test]
    fn counts_utf16_units_like_the_old_schema() -> R {
        // 20 UTF-16 units but 10 code points: the old schema accepts it.
        let errors = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "\u{1F600}".repeat(10)
        }));
        assert!(errors.is_empty());
        // 18 UTF-16 units: rejected.
        let errors = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "\u{1F600}".repeat(9)
        }));
        assert_eq!(paths(&errors), vec!["/systemPrompt".to_owned()]);
        Ok(())
    }

    #[test]
    fn null_description_is_accepted_and_wrong_type_is_not() -> R {
        let ok = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "xxxxxxxxxxxxxxxxxxxx",
            "description": null
        }));
        assert!(ok.is_empty());
        let bad = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "xxxxxxxxxxxxxxxxxxxx",
            "description": 123
        }));
        assert_eq!(paths(&bad), vec!["/description".to_owned()]);
        Ok(())
    }

    #[test]
    fn reports_array_element_paths() -> R {
        let errors = validate_create_value(&json!({
            "name": "A",
            "systemPrompt": "xxxxxxxxxxxxxxxxxxxx",
            "tags": ["a", null]
        }));
        assert_eq!(paths(&errors), vec!["/tags/1".to_owned()]);
        Ok(())
    }

    #[test]
    fn an_empty_update_body_is_valid() -> R {
        assert!(validate_update_value(&json!({})).is_empty());
        Ok(())
    }

    #[test]
    fn an_empty_name_fails_but_whitespace_passes_like_zod() -> R {
        let empty = validate_update_value(&json!({ "name": "" }));
        assert_eq!(paths(&empty), vec!["/name".to_owned()]);
        assert!(validate_update_value(&json!({ "name": "  " })).is_empty());
        Ok(())
    }

    #[test]
    fn a_non_object_body_reports_the_root() -> R {
        for body in [json!(null), json!("x"), json!([])] {
            let errors = validate_create_value(&body);
            assert_eq!(paths(&errors), vec!["".to_owned()]);
        }
        Ok(())
    }

    #[test]
    fn model_config_ranges_are_checked() -> R {
        let errors = validate_update_value(&json!({
            "modelConfig": { "temperature": 2.5, "topP": 1.5 }
        }));
        assert_eq!(
            paths(&errors),
            vec![
                "/modelConfig/temperature".to_owned(),
                "/modelConfig/topP".to_owned()
            ]
        );
        Ok(())
    }

    #[test]
    fn model_config_types_are_checked() -> R {
        let errors = validate_update_value(&json!({
            "modelConfig": { "temperature": "hot", "reasoningEffort": "extreme" }
        }));
        assert_eq!(
            paths(&errors),
            vec![
                "/modelConfig/temperature".to_owned(),
                "/modelConfig/reasoningEffort".to_owned()
            ]
        );
        Ok(())
    }

    #[test]
    fn guard_rails_tool_approval_is_an_enum() -> R {
        let errors = validate_update_value(&json!({
            "guardRails": { "toolApproval": "sometimes" }
        }));
        assert_eq!(paths(&errors), vec!["/guardRails/toolApproval".to_owned()]);
        let ok = validate_update_value(&json!({
            "guardRails": { "toolApproval": "all" }
        }));
        assert!(ok.is_empty());
        Ok(())
    }

    #[test]
    fn memory_config_nulls_are_type_errors_but_a_null_config_is_unset() -> R {
        let errors = validate_update_value(&json!({
            "memoryConfig": { "enabled": null }
        }));
        assert_eq!(paths(&errors), vec!["/memoryConfig/enabled".to_owned()]);
        assert!(validate_update_value(&json!({ "memoryConfig": null })).is_empty());
        Ok(())
    }

    #[test]
    fn chat_config_accepts_the_typed_fields() -> R {
        let errors = validate_update_value(&json!({
            "chatConfig": {
                "autoCreateTopic": true,
                "messageThreshold": 10,
                "historyCount": 0,
                "defaultCanvasMode": "application/mermaid"
            }
        }));
        assert!(errors.is_empty());
        Ok(())
    }

    #[test]
    fn the_typed_create_struct_round_trips_null_and_absent() -> R {
        let input: AssistantCreate = serde_json::from_str(
            r#"{"name":"A","systemPrompt":"xxxxxxxxxxxxxxxxxxxx","description":null,"emoji":"🤖"}"#,
        )?;
        assert_eq!(input.description, Some(None));
        assert_eq!(input.emoji, Some(Some("🤖".to_owned())));
        let absent: AssistantCreate =
            serde_json::from_str(r#"{"name":"A","systemPrompt":"xxxxxxxxxxxxxxxxxxxx"}"#)?;
        assert_eq!(absent.description, None);
        Ok(())
    }

    #[test]
    fn an_unknown_field_is_rejected_at_the_type_level() -> R {
        let result: Result<AssistantCreate, serde_json::Error> =
            serde_json::from_str(r#"{"name":"A","systemPrompt":"xxxxxxxxxxxxxxxxxxxx","x":1}"#);
        assert!(result.is_err());
        Ok(())
    }
}
