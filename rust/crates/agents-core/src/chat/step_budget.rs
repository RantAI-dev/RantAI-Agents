//! How many model calls one chat turn may make.
//!
//! Old: `src/features/chat-public/step-budget.ts` (`resolveMaxSteps`). The environment is read
//! by the caller (`RANTAI_DEFAULT_MAX_STEPS`, `RANTAI_MAX_STEPS_HARD_CAP`); this crate has no
//! I/O.

use serde_json::Value;

/// A chat without assistant tools: one call, plus one for a memory tool's answer.
pub const NO_TOOLS_DEFAULT: u32 = 2;
/// `RANTAI_DEFAULT_MAX_STEPS` when it is unset.
pub const PLATFORM_DEFAULT: u32 = 20;
/// `RANTAI_MAX_STEPS_HARD_CAP` when it is unset.
pub const HARD_CAP: u32 = 50;

/// `resolveMaxSteps(modelConfig, hasTools)`.
///
/// `model_config` is the assistant's raw `modelConfig` column: `maxSteps` is not one of the
/// typed fields, and the old code read it with `Number(...)`, so a numeric string counts too.
#[must_use]
pub fn resolve_max_steps(
    model_config: Option<&Value>,
    has_tools: bool,
    platform_default: u32,
    hard_cap: u32,
) -> u32 {
    if !has_tools {
        return NO_TOOLS_DEFAULT;
    }
    let requested = model_config
        .and_then(|config| config.get("maxSteps"))
        .and_then(|value| match value {
            Value::Number(number) => number.as_f64(),
            Value::String(text) => text.trim().parse::<f64>().ok(),
            _ => None,
        })
        .filter(|steps| steps.is_finite() && *steps > 0.0);
    let desired = requested.unwrap_or(f64::from(platform_default));
    // Clamped to `1..=hard_cap`, so the cast is exact.
    desired.trunc().max(1.0).min(f64::from(hard_cap)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_budget_follows_the_old_rules() {
        assert_eq!(resolve_max_steps(None, false, 20, 50), 2);
        assert_eq!(resolve_max_steps(None, true, 20, 50), 20);
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": 3})), true, 20, 50),
            3
        );
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": "4"})), true, 20, 50),
            4
        );
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": 2.9})), true, 20, 50),
            2
        );
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": 0.5})), true, 20, 50),
            1
        );
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": 500})), true, 20, 50),
            50
        );
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": -1})), true, 7, 50),
            7
        );
        assert_eq!(
            resolve_max_steps(Some(&json!({"maxSteps": "x"})), true, 7, 50),
            7
        );
    }
}
