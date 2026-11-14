//! `json_transform`: query, pick, flatten or sort JSON the model passes as text.
//!
//! Old: `src/lib/tools/builtin/json-transform.ts`. The parsed objects keep JavaScript's key
//! order (array-index keys first). Two things differ (differences row 73): a property is read
//! only from the object itself, never from `Object.prototype` (`constructor`, `toString`), and
//! strings sort with a case-insensitive comparison instead of the ICU collation behind
//! `localeCompare`.

use std::cmp::Ordering;

use serde_json::{Map, Value, json};

use super::{js, text};

pub const INPUT_SCHEMA: &str = r#"{"type":"object","properties":{"data":{"type":"string","description":"JSON string to transform"},"operation":{"type":"string","enum":["query","pick","flatten","sort"],"description":"Operation: 'query' = get value by dot-path, 'pick' = select specific keys, 'flatten' = flatten nested object, 'sort' = sort array"},"path":{"type":"string","description":"Dot-notation path for query operation (e.g. 'user.address.city', 'items[0].name')"},"keys":{"type":"array","items":{"type":"string"},"description":"Array of key names for pick operation"},"sortBy":{"type":"string","description":"Dot-path field to sort by (for sort operation on arrays of objects)"},"order":{"type":"string","enum":["asc","desc"],"default":"asc","description":"Sort order: 'asc' or 'desc'"}},"required":["data","operation"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}"#;

/// Runs the tool.
#[must_use]
pub fn run(input: &Map<String, Value>) -> Value {
    let Ok(parsed) = serde_json::from_str::<Value>(text(input, "data").unwrap_or_default()) else {
        return failure("Invalid JSON data");
    };
    let parsed = js::js_key_order(parsed);
    match text(input, "operation").unwrap_or_default() {
        "query" => {
            let Some(path) = text(input, "path").filter(|path| !path.is_empty()) else {
                return failure("'path' is required for query operation");
            };
            let result = get_by_path(&parsed, path).unwrap_or(Value::Null);
            json!({"success": true, "path": path, "result": result})
        }
        "pick" => {
            let Some(keys) = input.get("keys").and_then(Value::as_array) else {
                return failure("'keys' array is required for pick operation");
            };
            let Value::Object(object) = &parsed else {
                return failure("Pick operation requires a JSON object (not array)");
            };
            let mut result = Map::new();
            for key in keys.iter().filter_map(Value::as_str) {
                if let Some(value) = object.get(key) {
                    result.insert(key.to_owned(), value.clone());
                }
            }
            json!({"success": true, "result": js::js_key_order(Value::Object(result))})
        }
        "flatten" => {
            let Value::Object(object) = &parsed else {
                return failure("Flatten operation requires a JSON object (not array)");
            };
            let mut result = Map::new();
            flatten(object, "", &mut result);
            json!({"success": true, "result": js::js_key_order(Value::Object(result))})
        }
        "sort" => {
            let Value::Array(items) = parsed else {
                return failure("Sort operation requires a JSON array");
            };
            let sort_by = text(input, "sortBy");
            let descending = text(input, "order") == Some("desc");
            let mut sorted = items;
            sorted.sort_by(|a, b| {
                let (a, b) = match sort_by.filter(|path| !path.is_empty()) {
                    Some(path) => (get_by_path(a, path), get_by_path(b, path)),
                    None => (Some(a.clone()), Some(b.clone())),
                };
                let order = compare(a.as_ref(), b.as_ref());
                if descending { order.reverse() } else { order }
            });
            json!({"success": true, "result": sorted})
        }
        other => failure(&format!("Unknown operation: {other}")),
    }
}

fn failure(error: &str) -> Value {
    json!({"success": false, "error": error})
}

/// `getByPath`: `a.b`, `items[0].name`, and `length` of an array.
fn get_by_path(value: &Value, path: &str) -> Option<Value> {
    let mut current = value.clone();
    for part in path.split('.') {
        let indexed = part
            .strip_suffix(']')
            .and_then(|rest| rest.rsplit_once('['))
            .filter(|(name, index)| {
                !name.is_empty() && !index.is_empty() && index.bytes().all(|b| b.is_ascii_digit())
            });
        current = match indexed {
            Some((name, index)) => match member(&current, name)? {
                Value::Array(items) => items.get(index.parse::<usize>().ok()?)?.clone(),
                _ => return None,
            },
            None => member(&current, part)?,
        };
    }
    Some(current)
}

/// `value[key]` for an object or an array; anything else has no members here.
fn member(value: &Value, key: &str) -> Option<Value> {
    match value {
        Value::Object(object) => object.get(key).cloned(),
        Value::Array(items) if key == "length" => Some(Value::from(items.len())),
        Value::Array(items) => {
            if key.len() > 1 && key.starts_with('0') {
                return None;
            }
            items.get(key.parse::<usize>().ok()?).cloned()
        }
        _ => None,
    }
}

/// `flattenObject`: nested objects become dotted keys; arrays and `null` stay values.
fn flatten(object: &Map<String, Value>, prefix: &str, out: &mut Map<String, Value>) {
    for (key, value) in object {
        let name = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        match value {
            Value::Object(inner) => flatten(inner, &name, out),
            other => {
                out.insert(name, other.clone());
            }
        }
    }
}

/// The comparator of `sortArray`: numbers by value, everything else as text
/// (`String(value ?? "")`).
fn compare(a: Option<&Value>, b: Option<&Value>) -> Ordering {
    if let (Some(Value::Number(a)), Some(Value::Number(b))) = (a, b) {
        let (a, b) = (a.as_f64().unwrap_or(0.0), b.as_f64().unwrap_or(0.0));
        return a.partial_cmp(&b).unwrap_or(Ordering::Equal);
    }
    let text = |value: Option<&Value>| match value {
        None | Some(Value::Null) => String::new(),
        Some(other) => js::value_string(other),
    };
    locale_compare(&text(a), &text(b))
}

/// An approximation of `localeCompare` without ICU: spaces and punctuation before digits
/// before letters, case-insensitive first, then lower case before upper case, then the code
/// points.
fn locale_compare(a: &str, b: &str) -> Ordering {
    let primary = |text: &str| -> Vec<(u8, String)> {
        text.chars()
            .map(|c| {
                let class = if c.is_alphabetic() {
                    2
                } else if c.is_numeric() {
                    1
                } else {
                    0
                };
                (class, c.to_lowercase().collect())
            })
            .collect()
    };
    primary(a)
        .cmp(&primary(b))
        .then_with(|| {
            let flip = |c: char| {
                if c.is_lowercase() {
                    c.to_uppercase().next().unwrap_or(c)
                } else {
                    c.to_lowercase().next().unwrap_or(c)
                }
            };
            a.chars().map(flip).cmp(b.chars().map(flip))
        })
        .then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(value: Value) -> Value {
        run(value.as_object().unwrap_or(&Map::new()))
    }

    #[test]
    fn a_path_reads_nested_values_and_indices() {
        let data = r#"{"user":{"address":{"city":"Depok"}},"items":[{"name":"a"},{"name":"b"}]}"#;
        assert_eq!(
            call(json!({"data": data, "operation": "query", "path": "items[1].name"})),
            json!({"success": true, "path": "items[1].name", "result": "b"})
        );
        assert_eq!(
            call(json!({"data": data, "operation": "query", "path": "user.address.city"})),
            json!({"success": true, "path": "user.address.city", "result": "Depok"})
        );
        assert_eq!(
            call(json!({"data": data, "operation": "query", "path": "items.length"})),
            json!({"success": true, "path": "items.length", "result": 2})
        );
        assert_eq!(
            call(json!({"data": data, "operation": "query", "path": "user.nope.city"})),
            json!({"success": true, "path": "user.nope.city", "result": null})
        );
    }

    #[test]
    fn pick_flatten_and_sort_return_the_old_objects() {
        assert_eq!(
            call(
                json!({"data": r#"{"b":1,"a":2,"c":3}"#, "operation": "pick", "keys": ["c", "a", "z"]})
            ),
            json!({"success": true, "result": {"c": 3, "a": 2}})
        );
        assert_eq!(
            call(
                json!({"data": r#"{"a":{"b":{"c":1}},"d":[1],"e":null}"#, "operation": "flatten"})
            ),
            json!({"success": true, "result": {"a.b.c": 1, "d": [1], "e": null}})
        );
        assert_eq!(
            call(
                json!({"data": r#"[{"n":"b","v":2},{"n":"A","v":10},{"n":"a","v":1}]"#, "operation": "sort", "sortBy": "v", "order": "desc"})
            ),
            json!({"success": true, "result": [{"n":"A","v":10},{"n":"b","v":2},{"n":"a","v":1}]})
        );
        assert_eq!(
            call(json!({"data": r#"["b","B","a","A"]"#, "operation": "sort"})),
            json!({"success": true, "result": ["a", "A", "b", "B"]})
        );
    }

    #[test]
    fn the_old_errors_are_kept() {
        assert_eq!(
            call(json!({"data": "{", "operation": "flatten"})),
            json!({"success": false, "error": "Invalid JSON data"})
        );
        assert_eq!(
            call(json!({"data": "[1]", "operation": "pick", "keys": ["a"]})),
            json!({"success": false, "error": "Pick operation requires a JSON object (not array)"})
        );
        assert_eq!(
            call(json!({"data": "{}", "operation": "sort"})),
            json!({"success": false, "error": "Sort operation requires a JSON array"})
        );
    }
}
