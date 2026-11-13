//! The `{{variable}}` placeholders a system prompt may carry.
//!
//! Ported from `src/lib/prompts/variables.ts`. The old code resolved `{{date}}`,
//! `{{time}}` and `{{datetime}}` from `new Date().toLocale*String()`, which depends on the
//! server's locale and time zone; the port takes the current time from its caller and
//! prints ISO (see `docs/port/differences.md`).

use std::sync::LazyLock;

use regex::{Captures, Regex};

/// A prompt's variable context: everything is optional, like the old `VariableContext`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VariableContext {
    pub user_name: Option<String>,
    pub assistant_name: Option<String>,
    pub language: Option<String>,
}

/// The available variable names, in the order the UI shows them.
pub const AVAILABLE_VARIABLES: [&str; 6] = [
    "user_name",
    "date",
    "time",
    "datetime",
    "assistant_name",
    "language",
];

/// A short description per variable, for the UI tooltips.
pub const VARIABLE_DESCRIPTIONS: [(&str, &str); 6] = [
    ("user_name", "The current user's display name"),
    ("date", "Today's date (localized)"),
    ("time", "Current time (localized)"),
    ("datetime", "Current date and time"),
    ("assistant_name", "This agent's name"),
    ("language", "User's preferred language"),
];

/// The tooltip text for one variable, or `None` for an unknown name.
#[must_use]
pub fn variable_description(name: &str) -> Option<&'static str> {
    VARIABLE_DESCRIPTIONS
        .iter()
        .find(|(key, _)| *key == name)
        .map(|(_, description)| *description)
}

/// JavaScript's `\w`: ASCII word characters. The regex crate's `\w` is Unicode-aware.
static VARIABLE_PATTERN: LazyLock<Result<Regex, regex::Error>> =
    LazyLock::new(|| Regex::new(r"\{\{([A-Za-z0-9_]+)\}\}"));

/// Replaces `{{variable_name}}` placeholders with their values; unknown names are left
/// as-is, as the old code left them.
///
/// `now` is the current instant as an ISO-8601 string, e.g. `2026-11-14T08:30:00.000Z`.
#[must_use]
pub fn resolve_prompt_variables(prompt: &str, context: &VariableContext, now: &str) -> String {
    let (date, time) = iso_parts(now);
    let datetime = format!("{date} {time}");
    let fallback = |fallback: &str, value: &Option<String>| -> String {
        // `ctx.userName || "User"`: an empty string also falls back.
        match value {
            Some(value) if !value.is_empty() => value.clone(),
            _ => fallback.to_owned(),
        }
    };
    let user_name = fallback("User", &context.user_name);
    let assistant_name = fallback("Assistant", &context.assistant_name);
    let language = fallback("English", &context.language);

    match VARIABLE_PATTERN.as_ref() {
        Ok(pattern) => pattern
            .replace_all(prompt, |caps: &Captures| {
                let name = caps.get(1).map_or("", |m| m.as_str());
                match name {
                    "user_name" => user_name.clone(),
                    "assistant_name" => assistant_name.clone(),
                    "language" => language.clone(),
                    "date" => date.clone(),
                    "time" => time.clone(),
                    "datetime" => datetime.clone(),
                    // Unknown variables stay as they were written.
                    _ => caps.get(0).map_or("", |m| m.as_str()).to_owned(),
                }
            })
            .into_owned(),
        Err(_) => prompt.to_owned(),
    }
}

/// The date and the time of day of an ISO-8601 instant, as `YYYY-MM-DD` and `HH:MM:SS`.
/// Anything that is not shaped like an ISO instant yields empty strings.
fn iso_parts(now: &str) -> (String, String) {
    let date = now
        .get(0..10)
        .filter(|date| {
            date.bytes().enumerate().all(|(index, byte)| match index {
                4 | 7 => byte == b'-',
                _ => byte.is_ascii_digit(),
            })
        })
        .map_or(String::new(), str::to_owned);
    let time = if date.is_empty() {
        String::new()
    } else {
        now.get(11..19)
            .filter(|time| {
                time.bytes()
                    .all(|byte| byte.is_ascii_digit() || byte == b':')
            })
            .map_or(String::new(), str::to_owned)
    };
    (date, time)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    const NOW: &str = "2026-11-14T08:30:00.000Z";

    #[test]
    fn every_variable_resolves() -> Result<(), Box<dyn Error>> {
        let context = VariableContext {
            user_name: Some("Budi".to_owned()),
            assistant_name: Some("Helper".to_owned()),
            language: Some("Indonesian".to_owned()),
        };
        let text = resolve_prompt_variables(
            "Hello {{user_name}}, {{assistant_name}} speaks {{language}} at {{datetime}}.",
            &context,
            NOW,
        );
        assert_eq!(
            text,
            "Hello Budi, Helper speaks Indonesian at 2026-11-14 08:30:00."
        );
        Ok(())
    }

    #[test]
    fn empty_names_fall_back_like_the_falsy_old_check() {
        let context = VariableContext {
            user_name: Some(String::new()),
            ..VariableContext::default()
        };
        assert_eq!(
            resolve_prompt_variables("{{user_name}}", &context, NOW),
            "User"
        );
        assert_eq!(
            resolve_prompt_variables("{{date}}", &context, NOW),
            "2026-11-14"
        );
        assert_eq!(
            resolve_prompt_variables("{{time}}", &context, NOW),
            "08:30:00"
        );
    }

    #[test]
    fn unknown_variables_stay_untouched() {
        let text = resolve_prompt_variables(
            "a {{unknownvar}} {{{user_name}}}",
            &VariableContext::default(),
            NOW,
        );
        assert_eq!(text, "a {{unknownvar}} {User}");
    }

    #[test]
    fn a_non_iso_now_leaves_the_clock_empty() {
        assert_eq!(
            resolve_prompt_variables("{{date}}", &VariableContext::default(), "garbage"),
            ""
        );
    }
}
