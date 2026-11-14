//! JSON text the way `JSON.stringify` writes it, for the frames whose bytes must match the
//! TypeScript ones. Key order comes from `preserve_order`; numbers come from here.

use serde::Serialize;
use serde_json::{Map, Value};

/// A JSON number the way JavaScript prints it: an integral value has no `.0` (`1`, not
/// `1.0`) and `-0` is `0`, because `JSON.stringify(1.0)` is `"1"` while `serde_json` would
/// write `1.0`. Non-finite floats become `null`, as `JSON.stringify(NaN)` does.
///
/// Not covered (recorded in differences.md row 32): JavaScript writes `0.000001` and
/// `1e21` where Rust writes `1e-6` and the full digits; both parse to the same number.
#[must_use]
pub fn js_number(value: f64) -> Value {
    if !value.is_finite() {
        return Value::Null;
    }
    if value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        // Integral and below 2^53, so the cast is exact.
        return Value::from(value as i64);
    }
    Value::from(value)
}

/// Rewrites every float in `value` with [`js_number`]; integers are left alone.
pub fn normalize_numbers(value: &mut Value) {
    match value {
        Value::Number(number) if !number.is_i64() && !number.is_u64() => {
            if let Some(float) = number.as_f64() {
                *value = js_number(float);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(normalize_numbers),
        Value::Object(map) => map.values_mut().for_each(normalize_numbers),
        _ => {}
    }
}

/// `JSON.stringify(value)` for a serialisable Rust value. A value that cannot become JSON
/// (a map with non-string keys; none of this crate's types has one) is written as `null`,
/// so an encoder stays total without a panic.
#[must_use]
pub fn stringify<T: Serialize + ?Sized>(value: &T) -> String {
    let mut json = serde_json::to_value(value).unwrap_or(Value::Null);
    normalize_numbers(&mut json);
    serde_json::to_string(&json).unwrap_or_else(|_| "null".to_owned())
}

/// [`stringify`] for an object already built as a map.
#[must_use]
pub fn stringify_object(object: Map<String, Value>) -> String {
    stringify(&Value::Object(object))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn floats_print_like_javascript() -> Result<(), serde_json::Error> {
        let value: Value =
            serde_json::from_str(r#"{"days":7.0,"e":1e2,"neg0":-0.0,"half":0.5,"n":[3.0,4]}"#)?;
        assert_eq!(
            stringify(&value),
            r#"{"days":7,"e":100,"neg0":0,"half":0.5,"n":[3,4]}"#
        );
        assert_eq!(js_number(f64::NAN), Value::Null);
        assert_eq!(
            stringify(&json!({"big": 9_007_199_254_740_993_u64})),
            r#"{"big":9007199254740993}"#
        );
        Ok(())
    }
}
