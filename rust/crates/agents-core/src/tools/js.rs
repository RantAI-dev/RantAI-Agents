//! The bits of JavaScript semantics the old tools leaned on: UTF-16 lengths, how a number and a
//! value print, `Math.round` and the key order of a parsed object.

use serde_json::{Map, Value};

/// `string.length`: UTF-16 code units.
pub(super) fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// `String(number)` for the numbers these tools print.
///
/// An integral value has no `.0`; other values print with Rust's shortest round-trip digits,
/// which match JavaScript's except for the exponent forms (`1e21`, `1e-7`).
pub(super) fn number_string(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_owned();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_owned();
    }
    if value == 0.0 {
        return "0".to_owned();
    }
    format!("{value}")
}

/// `String(value)`, as the sort comparator saw a JSON value.
pub(super) fn value_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number
            .as_f64()
            .map_or_else(|| number.to_string(), number_string),
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                other => value_string(other),
            })
            .collect::<Vec<String>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_owned(),
    }
}

/// A number as `JSON.stringify` writes it: an integral value has no `.0` and `-0` is `0`. A
/// value that is not finite is `null`.
pub(super) fn number(value: f64) -> Value {
    if !value.is_finite() {
        return Value::Null;
    }
    if value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        #[allow(
            clippy::cast_possible_truncation,
            reason = "integral and below 2^53, so exact"
        )]
        return Value::from(value as i64);
    }
    Value::from(value)
}

/// Rewrites every float in `value` with [`number`]; integers are left alone.
pub(super) fn normalize_numbers(value: &mut Value) {
    match value {
        Value::Number(found) if !found.is_i64() && !found.is_u64() => {
            if let Some(float) = found.as_f64() {
                *value = number(float);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(normalize_numbers),
        Value::Object(map) => map.values_mut().for_each(normalize_numbers),
        _ => {}
    }
}

/// `Math.round`: halves go up, toward positive infinity.
pub(super) fn math_round(value: f64) -> f64 {
    let floor = value.floor();
    if value - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    }
}

/// A JSON value with its objects in the key order JavaScript gives them: the keys that are
/// array indices first, in ascending order, then the others in the order they were written.
pub(super) fn js_key_order(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.into_iter().map(js_key_order).collect()),
        Value::Object(map) => {
            let mut indices: Vec<(u32, String, Value)> = Vec::new();
            let mut others: Vec<(String, Value)> = Vec::new();
            for (key, item) in map {
                let item = js_key_order(item);
                match array_index(&key) {
                    Some(index) => indices.push((index, key, item)),
                    None => others.push((key, item)),
                }
            }
            indices.sort_by_key(|(index, _, _)| *index);
            let mut ordered = Map::new();
            for (_, key, item) in indices {
                ordered.insert(key, item);
            }
            for (key, item) in others {
                ordered.insert(key, item);
            }
            Value::Object(ordered)
        }
        other => other,
    }
}

/// The index a key names when it is a canonical array index (`"0"`, `"12"`, not `"012"`).
fn array_index(key: &str) -> Option<u32> {
    if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    if !key.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    key.parse::<u32>().ok().filter(|index| *index < u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_index_keys_come_first() {
        let ordered = js_key_order(json!({"b": 1, "2": 2, "1": 3, "01": 4}));
        let keys: Vec<&String> = ordered
            .as_object()
            .map(|map| map.keys().collect())
            .unwrap_or_default();
        assert_eq!(keys, ["1", "2", "b", "01"]);
    }

    #[test]
    fn numbers_and_values_print_like_javascript() {
        assert_eq!(number_string(14.0), "14");
        assert_eq!(number_string(-0.0), "0");
        assert_eq!(number_string(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(value_string(&json!([1, null, "a"])), "1,,a");
        assert_eq!(value_string(&json!({"a": 1})), "[object Object]");
        assert_eq!(math_round(2.5), 3.0);
        assert_eq!(math_round(-2.5), -2.0);
        assert_eq!(utf16_len("a😀"), 3);
    }
}
