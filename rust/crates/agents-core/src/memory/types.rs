//! The stored long-term profile: the `UserMemory` row value with type LONG_TERM.
//!
//! Ported from `src/lib/memory/types.ts`. The column holds JSON, so the field names stay
//! camelCase and unknown keys are ignored: a row written by an older version still loads.
//! A field of the wrong type is coerced the way `hydrateProfile` coerced it (a missing
//! fact list becomes empty, a missing summary becomes an empty string), because a chat
//! request must not fail over a row that is slightly off.

use serde::de::IgnoredAny;
use serde::{Deserialize, Deserializer, Serialize};

/// A fact about the user: one predicate with one value.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub predicate: String,
    #[serde(default)]
    pub object: String,
    #[serde(default, deserialize_with = "de_number")]
    pub confidence: f64,
    #[serde(default)]
    pub source: String,
    /// ISO-8601 instant. `None` for rows written before the field existed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// ISO-8601 instant of the last write. Used for the latest-wins rules.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// A preference of the user: one key with one value.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preference {
    #[serde(default)]
    pub id: String,
    /// The group the key belongs to, e.g. "communication".
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default, deserialize_with = "de_number")]
    pub confidence: f64,
    #[serde(default)]
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Everything the long-term memory keeps about one user.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default, deserialize_with = "de_facts")]
    pub facts: Vec<Fact>,
    #[serde(default, deserialize_with = "de_preferences")]
    pub preferences: Vec<Preference>,
    #[serde(default, deserialize_with = "de_text")]
    pub interaction_summary: String,
    #[serde(default, deserialize_with = "de_count")]
    pub total_conversations: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_interaction_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl UserProfile {
    /// The profile a user starts with.
    #[must_use]
    pub fn new(id: impl Into<String>, user_id: impl Into<String>, now: &str) -> Self {
        Self {
            id: id.into(),
            user_id: user_id.into(),
            facts: Vec::new(),
            preferences: Vec::new(),
            interaction_summary: "New user, no interaction history yet.".to_owned(),
            total_conversations: 0,
            last_interaction_at: Some(now.to_owned()),
            created_at: Some(now.to_owned()),
            updated_at: Some(now.to_owned()),
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum FactsOrIgnored {
    Facts(Vec<Fact>),
    Ignored(IgnoredAny),
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PreferencesOrIgnored {
    Preferences(Vec<Preference>),
    Ignored(IgnoredAny),
}

#[derive(Deserialize)]
#[serde(untagged)]
enum TextOrIgnored {
    Text(String),
    Ignored(IgnoredAny),
}

#[derive(Deserialize)]
#[serde(untagged)]
enum NumberOrIgnored {
    Number(f64),
    Ignored(IgnoredAny),
}

#[derive(Deserialize)]
#[serde(untagged)]
enum CountOrIgnored {
    Count(i64),
    Ignored(IgnoredAny),
}

fn de_facts<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<Fact>, D::Error> {
    match FactsOrIgnored::deserialize(deserializer)? {
        FactsOrIgnored::Facts(facts) => Ok(facts),
        FactsOrIgnored::Ignored(_) => Ok(Vec::new()),
    }
}

fn de_preferences<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<Preference>, D::Error> {
    match PreferencesOrIgnored::deserialize(deserializer)? {
        PreferencesOrIgnored::Preferences(preferences) => Ok(preferences),
        PreferencesOrIgnored::Ignored(_) => Ok(Vec::new()),
    }
}

fn de_text<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    match TextOrIgnored::deserialize(deserializer)? {
        TextOrIgnored::Text(text) => Ok(text),
        TextOrIgnored::Ignored(_) => Ok(String::new()),
    }
}

fn de_number<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    match NumberOrIgnored::deserialize(deserializer)? {
        NumberOrIgnored::Number(number) => Ok(number),
        NumberOrIgnored::Ignored(_) => Ok(0.0),
    }
}

fn de_count<'de, D: Deserializer<'de>>(deserializer: D) -> Result<i64, D::Error> {
    match CountOrIgnored::deserialize(deserializer)? {
        CountOrIgnored::Count(count) => Ok(count),
        CountOrIgnored::Ignored(_) => Ok(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_row_written_by_an_older_version_still_loads() -> Result<(), serde_json::Error> {
        let row = r#"{"id":"p1","userId":"u1","facts":[{"id":"f1","subject":"user","predicate":"location","object":"Depok","confidence":0.9,"source":"t","createdAt":"2026-01-01T00:00:00.000Z"}],"preferences":[],"interactionSummary":"","totalConversations":3,"legacyField":42}"#;
        let profile: UserProfile = serde_json::from_str(row)?;
        assert_eq!(profile.user_id, "u1");
        assert_eq!(profile.facts.len(), 1);
        assert_eq!(profile.total_conversations, 3);
        Ok(())
    }

    #[test]
    fn a_field_of_the_wrong_type_is_coerced_not_rejected() -> Result<(), serde_json::Error> {
        let row = r#"{"facts":"nope","preferences":7,"interactionSummary":12,"totalConversations":"many"}"#;
        let profile: UserProfile = serde_json::from_str(row)?;
        assert!(profile.facts.is_empty());
        assert!(profile.preferences.is_empty());
        assert_eq!(profile.interaction_summary, "");
        assert_eq!(profile.total_conversations, 0);
        Ok(())
    }

    #[test]
    fn an_absent_field_takes_its_default() -> Result<(), serde_json::Error> {
        let profile: UserProfile = serde_json::from_str("{}")?;
        assert_eq!(profile.total_conversations, 0);
        assert_eq!(profile.interaction_summary, "");
        assert!(profile.facts.is_empty());
        Ok(())
    }
}
