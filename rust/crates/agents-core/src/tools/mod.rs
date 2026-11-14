//! The built-in tools that need no outside service.
//!
//! Old: `src/lib/tools/builtin/{calculator,date-time,json-transform,text-utilities}.ts`. The
//! other built-in tools reach a service the port does not have yet (the knowledge base, S3,
//! a search provider, a sandbox, OCR, a channel) or read data across tenants
//! (`customer_lookup`), so a chat whose assistant has one of them stays with the TypeScript
//! service.
//!
//! A tool takes the input the model sent, checked against the tool's schema the way zod
//! checked it ([`validate`]), and returns the JSON the old tool returned. The clock comes from
//! the caller.

pub mod calculator;
mod date_format;
pub mod date_time;
mod js;
pub mod json_transform;
mod schema;
pub mod text_utilities;

use serde_json::{Map, Value};

/// Every built-in tool of the old registry (`BUILTIN_TOOLS`). A built-in row whose name is not
/// here was skipped by the old code, and is skipped by the port too.
pub const BUILTIN_TOOL_NAMES: [&str; 14] = [
    "knowledge_search",
    "customer_lookup",
    "channel_dispatch",
    "document_analysis",
    "file_operations",
    "web_search",
    "calculator",
    "date_time",
    "json_transform",
    "text_utilities",
    "create_artifact",
    "update_artifact",
    "code_interpreter",
    "ocr_document",
];

/// The built-in tools the port runs, in the order the old registry listed them.
pub const PORTED_BUILTIN_TOOLS: [&str; 4] = [
    "calculator",
    "date_time",
    "json_transform",
    "text_utilities",
];

/// Whether the port runs this built-in tool.
#[must_use]
pub fn is_ported(name: &str) -> bool {
    PORTED_BUILTIN_TOOLS.contains(&name)
}

/// The JSON Schema of a tool's input, as the AI SDK sent it to the model (`zodSchema(...)`,
/// printed from `ai` 6.0.39).
#[must_use]
pub fn input_schema(name: &str) -> Option<Value> {
    let text = match name {
        "calculator" => calculator::INPUT_SCHEMA,
        "date_time" => date_time::INPUT_SCHEMA,
        "json_transform" => json_transform::INPUT_SCHEMA,
        "text_utilities" => text_utilities::INPUT_SCHEMA,
        _ => return None,
    };
    serde_json::from_str(text).ok()
}

/// Checks the model's input against the tool's schema, the way zod parsed it: a required field
/// must be there, a field must have its type, an unknown field is dropped and a default is
/// filled in.
///
/// # Errors
/// The message the model gets back when the input does not fit.
pub fn validate(name: &str, input: &Value) -> Result<Map<String, Value>, String> {
    let schema = input_schema(name).ok_or_else(|| format!("There is no tool called {name}."))?;
    schema::parse(name, &schema, input)
}

/// Runs a tool on input that [`validate`] accepted. `now_ms` is the current instant in
/// milliseconds since the epoch. `None` when the port does not run the tool.
#[must_use]
pub fn execute(name: &str, input: &Map<String, Value>, now_ms: i64) -> Option<Value> {
    let mut output = match name {
        "calculator" => calculator::run(input),
        "date_time" => date_time::run(input, now_ms),
        "json_transform" => json_transform::run(input),
        "text_utilities" => text_utilities::run(input),
        _ => return None,
    };
    // The numbers print the way `JSON.stringify` prints them: `1`, not `1.0`.
    js::normalize_numbers(&mut output);
    Some(output)
}

/// A string field of an input [`validate`] accepted.
fn text<'a>(input: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    input.get(key).and_then(Value::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_ported_tool_has_a_schema() {
        for name in PORTED_BUILTIN_TOOLS {
            let schema = input_schema(name);
            assert!(
                schema
                    .as_ref()
                    .and_then(|schema| schema.get("properties"))
                    .is_some(),
                "{name}"
            );
        }
        assert!(input_schema("web_search").is_none());
        assert!(!is_ported("web_search"));
    }

    #[test]
    fn an_input_that_does_not_fit_is_refused_and_a_default_is_filled_in() {
        assert!(validate("calculator", &json!({})).is_err());
        assert!(validate("calculator", &json!({"expression": 1})).is_err());
        assert!(validate("calculator", &json!("2 + 2")).is_err());
        // zod's `.optional()` refuses null.
        assert!(validate("date_time", &json!({"operation": "now", "date": null})).is_err());
        assert!(validate("date_time", &json!({"operation": "later"})).is_err());
        let input = validate(
            "text_utilities",
            &json!({"text": "a", "operation": "truncate", "x": 1}),
        );
        assert_eq!(
            input.ok().map(Value::Object),
            Some(json!({"text": "a", "operation": "truncate", "maxLength": 100}))
        );
    }
}
