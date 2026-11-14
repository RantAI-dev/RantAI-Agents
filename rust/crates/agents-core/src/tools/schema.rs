//! The input check of a built-in tool: the subset of JSON Schema the four tools use (`string`,
//! `number`, `enum`, an array of strings, `required`, `default`), read the way zod parsed it.

use serde_json::{Map, Value};

/// The input as the tool sees it, or the message the model gets back.
pub(super) fn parse(
    tool: &str,
    schema: &Value,
    input: &Value,
) -> Result<Map<String, Value>, String> {
    let Some(object) = input.as_object() else {
        return Err(format!(
            "Invalid input for tool {tool}: the input must be a JSON object."
        ));
    };
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let required: Vec<&str> = schema
        .get("required")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();

    let mut problems = Vec::new();
    let mut parsed = Map::new();
    // The output follows the schema's order, as zod's did; a field the schema does not name
    // is dropped.
    for (key, property) in &properties {
        match object.get(key) {
            None => {
                if let Some(default) = property.get("default") {
                    parsed.insert(key.clone(), default.clone());
                } else if required.contains(&key.as_str()) {
                    problems.push(format!("\"{key}\" is required"));
                }
            }
            Some(value) => match check(property, value) {
                Ok(()) => {
                    parsed.insert(key.clone(), value.clone());
                }
                Err(expected) => problems.push(format!("\"{key}\" must be {expected}")),
            },
        }
    }
    if problems.is_empty() {
        Ok(parsed)
    } else {
        Err(format!(
            "Invalid input for tool {tool}: {}.",
            problems.join(", ")
        ))
    }
}

/// Whether a value has the type its property asks for; otherwise what was expected.
fn check(property: &Value, value: &Value) -> Result<(), String> {
    if let Some(options) = property.get("enum").and_then(Value::as_array) {
        return if options.contains(value) {
            Ok(())
        } else {
            let names: Vec<String> = options.iter().map(Value::to_string).collect();
            Err(format!("one of {}", names.join(", ")))
        };
    }
    match property.get("type").and_then(Value::as_str) {
        Some("string") if value.is_string() => Ok(()),
        Some("string") => Err("a string".to_owned()),
        Some("number") if value.is_number() => Ok(()),
        Some("number") => Err("a number".to_owned()),
        Some("array") => match value.as_array() {
            Some(items) if items.iter().all(Value::is_string) => Ok(()),
            _ => Err("a list of strings".to_owned()),
        },
        _ => Ok(()),
    }
}
