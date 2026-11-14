//! The guard-rails prompt section.
//!
//! Ported from `src/lib/prompts/guard-rails.ts`. The old function took the assistant's
//! `guardRails` column as whatever JSON it held, and so does this: an unknown field is
//! ignored, a `null` or absent config means no guard rails.

use serde_json::Value;

/// Builds a `SAFETY RULES` section from the configuration; empty when nothing is set.
#[must_use]
pub fn build_guard_rails_prompt(config: Option<&Value>) -> String {
    let Some(config) = config else {
        return String::new();
    };

    let mut parts: Vec<String> = Vec::new();

    // Blocked topics
    let topics: Vec<&str> = config
        .get("blockedTopics")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    if !topics.is_empty() {
        // A topic that is not a string is dropped (differences row 28).
        let joined = topics.join(", ");
        parts.push(format!(
            "- NEVER discuss, provide information about, or engage with the following topics: {joined}"
        ));
    }

    // Custom safety instructions
    if let Some(Value::String(instructions)) = config.get("safetyInstructions") {
        let trimmed = crate::memory::text::js_trim(instructions);
        if !trimmed.is_empty() {
            parts.push(format!("- {trimmed}"));
        }
    }

    // Max response length
    if let Some(length) = config.get("maxResponseLength").and_then(Value::as_f64)
        && length > 0.0
    {
        parts.push(format!(
            "- Keep all responses under {length} characters in length"
        ));
    }

    // Require citations
    if config.get("requireCitations") == Some(&Value::Bool(true)) {
        parts.push(
            "- Always cite sources when making factual claims. If you cannot cite a source, clearly state that the information is based on your training data".to_owned(),
        );
    }

    if parts.is_empty() {
        return String::new();
    }

    format!("\n\nSAFETY RULES:\n{}", parts.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::error::Error;

    #[test]
    fn nothing_configured_means_no_section() -> Result<(), Box<dyn Error>> {
        assert_eq!(build_guard_rails_prompt(None), "");
        assert_eq!(build_guard_rails_prompt(Some(&json!(null))), "");
        assert_eq!(build_guard_rails_prompt(Some(&json!({}))), "");
        assert_eq!(
            build_guard_rails_prompt(Some(&json!({"requireCitations": false}))),
            ""
        );
        Ok(())
    }

    #[test]
    fn every_rule_gets_its_line() -> Result<(), Box<dyn Error>> {
        let text = build_guard_rails_prompt(Some(&json!({
            "blockedTopics": ["politics", "gambling"],
            "safetyInstructions": "  Be polite  ",
            "maxResponseLength": 200,
            "requireCitations": true
        })));
        assert_eq!(
            text,
            "\n\nSAFETY RULES:\n\
             - NEVER discuss, provide information about, or engage with the following topics: politics, gambling\n\
             - Be polite\n\
             - Keep all responses under 200 characters in length\n\
             - Always cite sources when making factual claims. If you cannot cite a source, clearly state that the information is based on your training data"
        );
        Ok(())
    }
}
