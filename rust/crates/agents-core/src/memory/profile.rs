//! The merge, collapse, apply and forget rules of the long-term profile.
//!
//! Ported from `src/lib/memory/long-term-memory.ts`. The rules are:
//!
//! - a single-valued predicate holds one value: a new value replaces the old one,
//! - a multi-valued predicate (interest, language, skill, hobby, ...) holds many,
//! - a new fact evicts the preference with the same key, and the other way round, so the
//!   prompt never shows one value as a fact and another as a preference,
//! - the "quick context" summary is dropped whenever the remembered content changes, so it
//!   can never contradict the facts.

use serde::{Deserialize, Serialize};

use crate::memory::fact_keys::{
    is_multi_value_predicate, memory_key_matches, memory_value_matches, normalize_memory_key,
};
use crate::memory::text::js_cmp;
use crate::memory::time::parse_iso_millis;
use crate::memory::types::{Fact, Preference, UserProfile};

/// The confidence a fact or preference needs to be written to the profile and to reach the
/// prompt (`DEFAULT_MEMORY_CONFIG.profileUpdateThreshold`).
pub const PROFILE_UPDATE_THRESHOLD: f64 = 0.7;

/// How many facts the profile keeps (`DEFAULT_MEMORY_CONFIG.maxProfileFacts`).
pub const MAX_PROFILE_FACTS: usize = 50;

/// How many preferences the profile keeps.
pub const MAX_PROFILE_PREFERENCES: usize = 30;

/// What to forget.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgetCriteria {
    /// Keys/labels to forget, e.g. `["location"]`. Synonyms apply.
    #[serde(default)]
    pub keys: Vec<String>,
    /// Values/keywords to forget wherever they appear, e.g. `["Depok"]`.
    #[serde(default)]
    pub keywords: Vec<String>,
    /// Forget everything stored about the user.
    #[serde(default)]
    pub all: bool,
}

/// One removed item: the key it was stored under and the value that was dropped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedItem {
    pub key: String,
    pub value: String,
}

/// What a forget removed.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgetResult {
    pub removed_facts: Vec<RemovedItem>,
    pub removed_preferences: Vec<RemovedItem>,
}

/// The instant a value was last written. `updatedAt` wins over `createdAt`, and a value
/// without a readable instant has no time at all.
#[must_use]
pub fn time_of(updated_at: Option<&str>, created_at: Option<&str>) -> Option<i64> {
    updated_at.or(created_at).and_then(parse_iso_millis)
}

/// Later wins, unless the value already stored carries a strictly newer instant. A value
/// without a readable instant never loses.
fn is_newer_or_equal(candidate: Option<i64>, incumbent: Option<i64>) -> bool {
    match (candidate, incumbent) {
        (Some(candidate), Some(incumbent)) => candidate >= incumbent,
        _ => true,
    }
}

/// Two values are the same when they are the same once lowercased.
fn same_value(left: &str, right: &str) -> bool {
    left.to_lowercase() == right.to_lowercase()
}

/// Canonicalize the predicates and collapse duplicate single-valued facts, keeping the most
/// recent. Also repairs profiles written before the predicates were normalized (a legacy
/// profile holding both "location: Depok" and "location: Bandung").
#[must_use]
pub fn collapse_facts(facts: &[Fact]) -> Vec<Fact> {
    let mut out: Vec<Fact> = Vec::with_capacity(facts.len());
    let mut single: Vec<(String, usize)> = Vec::new();

    for raw in facts {
        let mut fact = raw.clone();
        fact.predicate = normalize_memory_key(Some(&raw.predicate));

        if is_multi_value_predicate(&fact.predicate) {
            let duplicate = out
                .iter()
                .position(|f| f.predicate == fact.predicate && same_value(&f.object, &fact.object));
            match duplicate {
                Some(index) => {
                    let incumbent = out
                        .get(index)
                        .and_then(|f| time_of(f.updated_at.as_deref(), f.created_at.as_deref()));
                    let candidate = time_of(fact.updated_at.as_deref(), fact.created_at.as_deref());
                    if is_newer_or_equal(candidate, incumbent)
                        && let Some(slot) = out.get_mut(index)
                    {
                        *slot = fact;
                    }
                }
                None => out.push(fact),
            }
            continue;
        }

        match single.iter().find(|(key, _)| *key == fact.predicate) {
            None => {
                single.push((fact.predicate.clone(), out.len()));
                out.push(fact);
            }
            Some(&(_, index)) => {
                let incumbent = out
                    .get(index)
                    .and_then(|f| time_of(f.updated_at.as_deref(), f.created_at.as_deref()));
                let candidate = time_of(fact.updated_at.as_deref(), fact.created_at.as_deref());
                if is_newer_or_equal(candidate, incumbent)
                    && let Some(slot) = out.get_mut(index)
                {
                    *slot = fact;
                }
            }
        }
    }
    out
}

/// The same as [`collapse_facts`] for preferences, keyed on the normalized key.
#[must_use]
pub fn collapse_preferences(preferences: &[Preference]) -> Vec<Preference> {
    let mut out: Vec<Preference> = Vec::with_capacity(preferences.len());
    let mut single: Vec<(String, usize)> = Vec::new();

    for raw in preferences {
        let mut preference = raw.clone();
        preference.key = normalize_memory_key(Some(&raw.key));

        if is_multi_value_predicate(&preference.key) {
            let duplicate = out
                .iter()
                .position(|p| p.key == preference.key && same_value(&p.value, &preference.value));
            match duplicate {
                Some(index) => {
                    let incumbent = out
                        .get(index)
                        .and_then(|p| time_of(p.updated_at.as_deref(), p.created_at.as_deref()));
                    let candidate = time_of(
                        preference.updated_at.as_deref(),
                        preference.created_at.as_deref(),
                    );
                    if is_newer_or_equal(candidate, incumbent)
                        && let Some(slot) = out.get_mut(index)
                    {
                        *slot = preference;
                    }
                }
                None => out.push(preference),
            }
            continue;
        }

        match single.iter().find(|(key, _)| *key == preference.key) {
            None => {
                single.push((preference.key.clone(), out.len()));
                out.push(preference);
            }
            Some(&(_, index)) => {
                let incumbent = out
                    .get(index)
                    .and_then(|p| time_of(p.updated_at.as_deref(), p.created_at.as_deref()));
                let candidate = time_of(
                    preference.updated_at.as_deref(),
                    preference.created_at.as_deref(),
                );
                if is_newer_or_equal(candidate, incumbent)
                    && let Some(slot) = out.get_mut(index)
                {
                    *slot = preference;
                }
            }
        }
    }
    out
}

/// Merge new facts into the existing ones.
///
/// A single-valued predicate takes the new value, unless the new value is below the
/// confidence threshold and the stored one is not. A multi-valued predicate appends, with
/// the value deduplicated.
#[must_use]
pub fn merge_facts(existing: &[Fact], new_facts: &[Fact], now: &str) -> Vec<Fact> {
    let mut merged = collapse_facts(existing);

    for raw in new_facts {
        let mut new_fact = raw.clone();
        new_fact.predicate = normalize_memory_key(Some(&raw.predicate));
        new_fact.updated_at = Some(now.to_owned());

        if is_multi_value_predicate(&new_fact.predicate) {
            let duplicate = merged.iter().position(|f| {
                f.predicate == new_fact.predicate && same_value(&f.object, &new_fact.object)
            });
            match duplicate {
                Some(index) => {
                    if let Some(slot) = merged.get_mut(index) {
                        slot.updated_at = Some(now.to_owned());
                    }
                }
                None => merged.push(new_fact),
            }
            continue;
        }

        match merged
            .iter()
            .position(|f| f.predicate == new_fact.predicate)
        {
            None => merged.push(new_fact),
            Some(index) => {
                let old_confidence = merged.get(index).map_or(0.0, |f| f.confidence);
                if new_fact.confidence < PROFILE_UPDATE_THRESHOLD
                    && old_confidence >= PROFILE_UPDATE_THRESHOLD
                {
                    continue;
                }
                // Move to the end so the array order also reflects recency.
                let _ = merged.remove(index);
                merged.push(new_fact);
            }
        }
    }

    keep_last(&mut merged, MAX_PROFILE_FACTS);
    merged
}

/// Merge preferences with the same latest-wins rule, keyed on the normalized key.
#[must_use]
pub fn merge_preferences(
    existing: &[Preference],
    new_preferences: &[Preference],
    now: &str,
) -> Vec<Preference> {
    let mut merged = collapse_preferences(existing);

    for raw in new_preferences {
        let mut new_preference = raw.clone();
        new_preference.key = normalize_memory_key(Some(&raw.key));
        new_preference.updated_at = Some(now.to_owned());
        if new_preference
            .created_at
            .as_deref()
            .unwrap_or_default()
            .is_empty()
        {
            new_preference.created_at = Some(now.to_owned());
        }

        if is_multi_value_predicate(&new_preference.key) {
            let duplicate = merged.iter().position(|p| {
                p.key == new_preference.key && same_value(&p.value, &new_preference.value)
            });
            match duplicate {
                Some(index) => {
                    if let Some(slot) = merged.get_mut(index) {
                        slot.updated_at = Some(now.to_owned());
                    }
                }
                None => merged.push(new_preference),
            }
            continue;
        }

        if let Some(index) = merged.iter().position(|p| p.key == new_preference.key) {
            let _ = merged.remove(index);
        }
        merged.push(new_preference);
    }

    keep_last(&mut merged, MAX_PROFILE_PREFERENCES);
    merged
}

/// Drop the oldest entries, the way `Array.prototype.slice(-n)` does.
fn keep_last<T>(items: &mut Vec<T>, max: usize) {
    if items.len() > max {
        let excess = items.len() - max;
        items.drain(..excess);
    }
}

/// A stable fingerprint of the remembered content, used to detect that it changed.
#[must_use]
pub fn profile_content_fingerprint(profile: &UserProfile) -> String {
    let mut facts: Vec<String> = profile
        .facts
        .iter()
        .map(|fact| {
            format!(
                "{}={}",
                normalize_memory_key(Some(&fact.predicate)),
                fact.object
            )
        })
        .collect();
    let mut preferences: Vec<String> = profile
        .preferences
        .iter()
        .map(|preference| {
            format!(
                "{}={}",
                normalize_memory_key(Some(&preference.key)),
                preference.value
            )
        })
        .collect();
    facts.sort_by(|a, b| js_cmp(a, b));
    preferences.sort_by(|a, b| js_cmp(a, b));

    // A list of strings cannot fail to serialize; the fallback is never reached.
    serde_json::to_string(&[facts, preferences]).unwrap_or_default()
}

/// Apply new facts and preferences to a profile.
///
/// Returns true when the remembered content changed. A change drops the summary and
/// stamps the profile.
pub fn apply_memory_update(
    profile: &mut UserProfile,
    facts: &[Fact],
    preferences: &[Preference],
    now: &str,
) -> bool {
    let before = profile_content_fingerprint(profile);

    if !facts.is_empty() {
        profile.facts = merge_facts(&profile.facts, facts, now);
        let fact_keys: Vec<String> = facts
            .iter()
            .map(|fact| normalize_memory_key(Some(&fact.predicate)))
            .filter(|key| !is_multi_value_predicate(key))
            .collect();
        profile
            .preferences
            .retain(|preference| !fact_keys.contains(&normalize_memory_key(Some(&preference.key))));
    } else {
        profile.facts = collapse_facts(&profile.facts);
    }

    if !preferences.is_empty() {
        profile.preferences = merge_preferences(&profile.preferences, preferences, now);
        let preference_keys: Vec<String> = preferences
            .iter()
            .map(|preference| normalize_memory_key(Some(&preference.key)))
            .filter(|key| !is_multi_value_predicate(key))
            .collect();
        profile
            .facts
            .retain(|fact| !preference_keys.contains(&normalize_memory_key(Some(&fact.predicate))));
    } else {
        profile.preferences = collapse_preferences(&profile.preferences);
    }

    let changed = profile_content_fingerprint(profile) != before;
    if changed {
        profile.interaction_summary = String::new();
        profile.updated_at = Some(now.to_owned());
    }
    changed
}

fn fact_matches(fact: &Fact, criteria: &ForgetCriteria) -> bool {
    if criteria.all {
        return true;
    }
    if criteria
        .keys
        .iter()
        .any(|key| memory_key_matches(&fact.predicate, key))
    {
        return true;
    }
    criteria.keywords.iter().any(|keyword| {
        memory_value_matches(Some(&fact.object), keyword)
            || memory_key_matches(&fact.predicate, keyword)
    })
}

fn preference_matches(preference: &Preference, criteria: &ForgetCriteria) -> bool {
    if criteria.all {
        return true;
    }
    if criteria.keys.iter().any(|key| {
        memory_key_matches(&preference.key, key) || memory_key_matches(&preference.category, key)
    }) {
        return true;
    }
    criteria.keywords.iter().any(|keyword| {
        memory_value_matches(Some(&preference.value), keyword)
            || memory_key_matches(&preference.key, keyword)
    })
}

/// Remove the matching facts and preferences from a profile.
pub fn apply_forget(
    profile: &mut UserProfile,
    criteria: &ForgetCriteria,
    now: &str,
) -> ForgetResult {
    let mut removed_facts: Vec<RemovedItem> = Vec::new();
    let mut removed_preferences: Vec<RemovedItem> = Vec::new();
    let mut facts: Vec<Fact> = Vec::with_capacity(profile.facts.len());
    let mut preferences: Vec<Preference> = Vec::with_capacity(profile.preferences.len());

    for fact in &profile.facts {
        if fact_matches(fact, criteria) {
            removed_facts.push(RemovedItem {
                key: normalize_memory_key(Some(&fact.predicate)),
                value: fact.object.clone(),
            });
        } else {
            facts.push(fact.clone());
        }
    }
    for preference in &profile.preferences {
        if preference_matches(preference, criteria) {
            removed_preferences.push(RemovedItem {
                key: normalize_memory_key(Some(&preference.key)),
                value: preference.value.clone(),
            });
        } else {
            preferences.push(preference.clone());
        }
    }

    profile.facts = facts;
    profile.preferences = preferences;

    if !removed_facts.is_empty() || !removed_preferences.is_empty() || criteria.all {
        // The summary was written from the removed data; never let it outlive a deletion.
        profile.interaction_summary = String::new();
        profile.updated_at = Some(now.to_owned());
    }

    ForgetResult {
        removed_facts,
        removed_preferences,
    }
}

/// Does the "quick context" summary need to be regenerated?
#[must_use]
pub fn summary_needs_refresh(profile: &UserProfile) -> bool {
    if profile.facts.is_empty() && profile.preferences.is_empty() {
        return false;
    }
    let summary = &profile.interaction_summary;
    summary.is_empty() || summary.starts_with("New user") || profile.total_conversations % 5 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(label: &str, value: &str, confidence: f64) -> Fact {
        Fact {
            id: "f1".to_owned(),
            subject: "user".to_owned(),
            predicate: label.to_owned(),
            object: value.to_owned(),
            confidence,
            source: "t".to_owned(),
            created_at: Some("2026-01-01T00:00:00.000Z".to_owned()),
            updated_at: None,
        }
    }

    fn preference(key: &str, value: &str) -> Preference {
        Preference {
            id: "p1".to_owned(),
            category: "general".to_owned(),
            key: key.to_owned(),
            value: value.to_owned(),
            confidence: 0.9,
            source: "t".to_owned(),
            created_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn an_update_replaces_the_old_value() {
        let merged = merge_facts(
            &[fact("location", "Bandung", 0.9)],
            &[fact("base", "Jakarta", 0.9)],
            "2026-02-01T00:00:00.000Z",
        );
        assert_eq!(merged.len(), 1);
        assert_eq!(merged.first().map(|f| f.object.as_str()), Some("Jakarta"));
        assert_eq!(
            merged.first().map(|f| f.predicate.as_str()),
            Some("location")
        );
    }

    #[test]
    fn a_low_confidence_guess_does_not_overwrite_a_confident_value() {
        let merged = merge_facts(
            &[fact("location", "Bandung", 0.9)],
            &[fact("location", "Mars", 0.3)],
            "2026-02-01T00:00:00.000Z",
        );
        assert_eq!(merged.len(), 1);
        assert_eq!(merged.first().map(|f| f.object.as_str()), Some("Bandung"));
    }

    #[test]
    fn a_multi_valued_predicate_keeps_both() {
        let merged = merge_facts(
            &[fact("hobby", "reading", 0.9)],
            &[fact("hobbies", "swimming", 0.9)],
            "2026-02-01T00:00:00.000Z",
        );
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn a_new_fact_evicts_the_preference_with_the_same_key() {
        let mut profile = UserProfile::new("p1", "u1", "2026-01-01T00:00:00.000Z");
        profile.preferences = vec![preference("favorite_color", "blue")];
        let changed = apply_memory_update(
            &mut profile,
            &[fact("warna_favorit", "green", 0.9)],
            &[],
            "2026-02-01T00:00:00.000Z",
        );
        assert!(changed);
        assert!(profile.preferences.is_empty());
        assert_eq!(profile.facts.len(), 1);
    }

    #[test]
    fn a_change_drops_the_summary() {
        let mut profile = UserProfile::new("p1", "u1", "2026-01-01T00:00:00.000Z");
        profile.interaction_summary = "A user based in Depok.".to_owned();
        profile.facts = vec![fact("location", "Depok", 0.9)];
        apply_memory_update(
            &mut profile,
            &[fact("location", "Bandung", 0.9)],
            &[],
            "2026-02-01T00:00:00.000Z",
        );
        assert_eq!(profile.interaction_summary, "");
    }

    #[test]
    fn forgetting_everything_clears_the_summary() {
        let mut profile = UserProfile::new("p1", "u1", "2026-01-01T00:00:00.000Z");
        profile.interaction_summary = "A user.".to_owned();
        profile.facts = vec![fact("location", "Depok", 0.9)];
        let result = apply_forget(
            &mut profile,
            &ForgetCriteria {
                all: true,
                ..ForgetCriteria::default()
            },
            "2026-02-01T00:00:00.000Z",
        );
        assert_eq!(result.removed_facts.len(), 1);
        assert!(profile.facts.is_empty());
        assert_eq!(profile.interaction_summary, "");
    }
}
