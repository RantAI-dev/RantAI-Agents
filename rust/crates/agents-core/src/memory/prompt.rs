//! How the profile reaches the model.
//!
//! Ported from `formatUserProfileForPrompt` in `src/lib/memory/long-term-memory.ts` and
//! from `buildPromptWithMemory` in `src/lib/memory/index.ts`. Only the long-term profile
//! is here: working memory and semantic recall are out of scope for this port, so the
//! prompt builder takes the profile and nothing else.

use crate::memory::fact_keys::is_multi_value_predicate;
use crate::memory::profile::{
    PROFILE_UPDATE_THRESHOLD, collapse_facts, collapse_preferences, time_of,
};
use crate::memory::time::{iso_date, parse_iso_millis};
use crate::memory::types::{Fact, Preference, UserProfile};

/// The rule the profile is shown with: the newest value is the one that counts.
const PROFILE_RULE: &str = "Each item holds the CURRENT value. If anything here (or in past messages) conflicts, the most recently updated value is authoritative; treat older values as outdated and do not ask the user to choose between them. Anything the user asked to forget has been removed.";

/// The date a value was last written, as ` (updated 2026-11-14)`.
fn format_updated(updated_at: Option<&str>, created_at: Option<&str>) -> String {
    match time_of(updated_at, created_at) {
        Some(millis) => format!(" (updated {})", iso_date(millis)),
        None => String::new(),
    }
}

/// The profile as the model reads it, or an empty string when there is nothing to show.
#[must_use]
pub fn format_user_profile_for_prompt(profile: &UserProfile, now: &str) -> String {
    let mut facts: Vec<Fact> = collapse_facts(&profile.facts)
        .into_iter()
        .filter(|fact| fact.confidence >= PROFILE_UPDATE_THRESHOLD)
        .collect();
    let mut preferences: Vec<Preference> = collapse_preferences(&profile.preferences)
        .into_iter()
        .filter(|preference| preference.confidence >= PROFILE_UPDATE_THRESHOLD)
        .collect();

    // Defensive: a fact and a preference on the same single-valued key -> keep the newer.
    let mut dropped_preference_keys: Vec<String> = Vec::new();
    facts.retain(|fact| {
        if is_multi_value_predicate(&fact.predicate) {
            return true;
        }
        let Some(preference) = preferences
            .iter()
            .find(|preference| preference.key == fact.predicate)
        else {
            return true;
        };
        let preference_time = time_of(
            preference.updated_at.as_deref(),
            preference.created_at.as_deref(),
        );
        let fact_time = time_of(fact.updated_at.as_deref(), fact.created_at.as_deref());
        let preference_is_newer = match preference_time {
            Some(preference_time) => fact_time.is_none_or(|fact_time| preference_time > fact_time),
            None => false,
        };
        if preference_is_newer {
            return false;
        }
        dropped_preference_keys.push(preference.key.clone());
        true
    });
    preferences.retain(|preference| !dropped_preference_keys.contains(&preference.key));

    let mut parts: Vec<String> = Vec::new();

    if !facts.is_empty() {
        let lines: Vec<String> = facts
            .iter()
            .map(|fact| {
                format!(
                    "- {}: {}{}",
                    fact.predicate,
                    fact.object,
                    format_updated(fact.updated_at.as_deref(), fact.created_at.as_deref())
                )
            })
            .collect();
        parts.push(format!(
            "Known facts about this user:\n{}",
            lines.join("\n")
        ));
    }

    if !preferences.is_empty() {
        let lines: Vec<String> = preferences
            .iter()
            .map(|preference| {
                format!(
                    "- {}: {}{}",
                    preference.key,
                    preference.value,
                    format_updated(
                        preference.updated_at.as_deref(),
                        preference.created_at.as_deref()
                    )
                )
            })
            .collect();
        parts.push(format!("User preferences:\n{}", lines.join("\n")));
    }

    // The summary is cleared whenever the facts change, so it never predates them.
    if !profile.interaction_summary.is_empty()
        && !profile.interaction_summary.starts_with("New user")
    {
        parts.push(format!("Quick context: {}", profile.interaction_summary));
    }

    if profile.total_conversations > 1 {
        let last = profile
            .last_interaction_at
            .as_deref()
            .and_then(parse_iso_millis)
            .or_else(|| parse_iso_millis(now))
            .map_or_else(String::new, iso_date);
        parts.push(format!(
            "Interaction history: {} conversations, last: {}",
            profile.total_conversations, last
        ));
    }

    if parts.is_empty() {
        return String::new();
    }

    format!(
        "--- Long-term User Profile ---\n{}\n\n{}",
        PROFILE_RULE,
        parts.join("\n\n")
    )
}

/// The system prompt with the profile added to it.
///
/// The old `buildPromptWithMemory` also took working memory and semantic recall; both are
/// out of scope for this port, so only the profile is added here.
#[must_use]
pub fn build_prompt_with_memory(
    base_prompt: &str,
    user_profile: Option<&UserProfile>,
    now: &str,
) -> String {
    let mut parts: Vec<String> = vec![base_prompt.to_owned()];
    if let Some(profile) = user_profile {
        let context = format_user_profile_for_prompt(profile, now);
        if !context.is_empty() {
            parts.push(context);
        }
    }
    parts.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> UserProfile {
        UserProfile {
            id: "p1".to_owned(),
            user_id: "u1".to_owned(),
            facts: vec![Fact {
                id: "f1".to_owned(),
                subject: "user".to_owned(),
                predicate: "location".to_owned(),
                object: "Depok".to_owned(),
                confidence: 0.9,
                source: "t".to_owned(),
                created_at: Some("2026-01-01T00:00:00.000Z".to_owned()),
                updated_at: Some("2026-09-01T00:00:00.000Z".to_owned()),
            }],
            preferences: vec![],
            interaction_summary: String::new(),
            total_conversations: 3,
            last_interaction_at: Some("2026-09-01T00:00:00.000Z".to_owned()),
            created_at: Some("2026-01-01T00:00:00.000Z".to_owned()),
            updated_at: Some("2026-09-01T00:00:00.000Z".to_owned()),
        }
    }

    #[test]
    fn shows_the_facts_with_the_date_they_were_written() {
        let text = format_user_profile_for_prompt(&profile(), "2026-11-14T00:00:00.000Z");
        assert!(text.contains("location:"));
        assert!(text.contains("Depok"));
        assert!(text.contains("(updated 2026-09-01)"));
        assert!(text.contains("most recently updated value is authoritative"));
    }

    #[test]
    fn the_interaction_history_uses_an_iso_date() {
        let text = format_user_profile_for_prompt(&profile(), "2026-11-14T00:00:00.000Z");
        assert!(text.contains("Interaction history: 3 conversations, last: 2026-09-01"));
    }

    #[test]
    fn an_empty_profile_adds_nothing_to_the_prompt() {
        let prompt = build_prompt_with_memory("You are helpful.", None, "2026-11-14T00:00:00.000Z");
        assert_eq!(prompt, "You are helpful.");
    }

    #[test]
    fn the_profile_is_appended_to_the_base_prompt() {
        let prompt = build_prompt_with_memory(
            "You are helpful.",
            Some(&profile()),
            "2026-11-14T00:00:00.000Z",
        );
        assert!(prompt.starts_with("You are helpful.\n\n--- Long-term User Profile ---"));
    }
}
