//! Parity with the TypeScript memory module.
//!
//! The cases come from `port/cases/memory.jsonl`, which `port/oracle/memory.ts` generated
//! from `port/cases/memory.in.jsonl`: every expected value is what the OLD TypeScript
//! returned, none of them was written by hand.
//!
//! One difference is deliberate and documented in `docs/port/differences.md`: the old
//! formatter printed the interaction date with `toLocaleDateString()`, which depends on
//! the locale and the time zone, and the port prints an ISO date. Everything else in that
//! line is compared, and the date itself is checked by the unit tests in
//! `src/memory/prompt.rs`.

use std::error::Error;
use std::fs;

use agents_core::memory::fact_keys::{
    is_multi_value_predicate, memory_key_matches, memory_value_matches, normalize_memory_key,
};
use agents_core::memory::profile::{
    apply_forget, apply_memory_update, collapse_facts, collapse_preferences, merge_facts,
    merge_preferences, profile_content_fingerprint, summary_needs_refresh,
};
use agents_core::memory::prompt::{build_prompt_with_memory, format_user_profile_for_prompt};
use agents_core::memory::tools::{
    FORGET_MEMORY_INPUT_SCHEMA, ForgetMemoryInput, SAVE_MEMORY_INPUT_SCHEMA, SaveMemoryInput,
    StoredStatus, forget_criteria, forget_memory_result, save_memory_result, to_facts,
    to_preferences,
};
use agents_core::memory::types::{Fact, Preference, UserProfile};
use serde_json::{Value, json};

const CASES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../port/cases/memory.jsonl"
);

/// The instant the cases use when they need one.
const NOW: &str = "2026-11-14T08:30:00.000Z";

fn arg(args: &[Value], index: usize) -> Result<&Value, std::io::Error> {
    args.get(index)
        .ok_or_else(|| std::io::Error::other(format!("missing argument {index}")))
}

fn arg_str(args: &[Value], index: usize) -> Result<&str, std::io::Error> {
    arg(args, index)?
        .as_str()
        .ok_or_else(|| std::io::Error::other(format!("argument {index} is not a string")))
}

fn arg_profile(args: &[Value], index: usize) -> Result<UserProfile, Box<dyn Error>> {
    Ok(serde_json::from_value(arg(args, index)?.clone())?)
}

fn arg_facts(args: &[Value], index: usize) -> Result<Vec<Fact>, Box<dyn Error>> {
    Ok(serde_json::from_value(arg(args, index)?.clone())?)
}

fn arg_preferences(args: &[Value], index: usize) -> Result<Vec<Preference>, Box<dyn Error>> {
    Ok(serde_json::from_value(arg(args, index)?.clone())?)
}

/// The profile fields the memory functions change. The old oracle sent the same four.
fn project_profile(profile: &UserProfile, changed: Option<bool>) -> Value {
    let mut value = json!({
        "facts": profile.facts,
        "preferences": profile.preferences,
        "interactionSummary": profile.interaction_summary,
        "updatedAt": profile.updated_at,
    });
    if let (Some(changed), Some(object)) = (changed, value.as_object_mut()) {
        object.insert("changed".to_owned(), Value::from(changed));
    }
    value
}

/// The ids come from the caller in Rust and from `nanoid()` in TypeScript, so they are
/// replaced on both sides.
fn project_facts(facts: &[Fact]) -> Value {
    Value::from(
        facts
            .iter()
            .map(|fact| {
                json!({
                    "id": "<generated>",
                    "subject": fact.subject,
                    "predicate": fact.predicate,
                    "object": fact.object,
                    "confidence": fact.confidence,
                    "source": fact.source,
                    "createdAt": fact.created_at,
                    "updatedAt": fact.updated_at,
                })
            })
            .collect::<Vec<Value>>(),
    )
}

fn project_preferences(preferences: &[Preference]) -> Value {
    Value::from(
        preferences
            .iter()
            .map(|preference| {
                json!({
                    "id": "<generated>",
                    "category": preference.category,
                    "key": preference.key,
                    "value": preference.value,
                    "confidence": preference.confidence,
                    "source": preference.source,
                    "createdAt": preference.created_at,
                    "updatedAt": preference.updated_at,
                })
            })
            .collect::<Vec<Value>>(),
    )
}

/// The old formatter printed the interaction date with `toLocaleDateString()`; the port
/// prints ISO (differences.md). The date is replaced on both sides, everything else in the
/// line is compared.
fn without_last_date(text: &str) -> String {
    text.split('\n')
        .map(|line| {
            if line.starts_with("Interaction history: ") {
                if let Some((head, _)) = line.split_once(", last: ") {
                    return format!("{head}, last: <date>");
                }
            }
            line.to_owned()
        })
        .collect::<Vec<String>>()
        .join("\n")
}

fn ids() -> impl FnMut() -> String {
    let mut counter = 0;
    move || {
        counter += 1;
        format!("id_{counter}")
    }
}

fn dispatch(name: &str, args: &[Value]) -> Result<Value, Box<dyn Error>> {
    let value = match name {
        "normalizeMemoryKey" => {
            serde_json::to_value(normalize_memory_key(Some(arg_str(args, 0)?)))?
        }
        "isMultiValuePredicate" => {
            serde_json::to_value(is_multi_value_predicate(arg_str(args, 0)?))?
        }
        "memoryKeyMatches" => {
            serde_json::to_value(memory_key_matches(arg_str(args, 0)?, arg_str(args, 1)?))?
        }
        "memoryValueMatches" => serde_json::to_value(memory_value_matches(
            arg(args, 0)?.as_str(),
            arg_str(args, 1)?,
        ))?,
        "collapseFacts" => serde_json::to_value(collapse_facts(&arg_facts(args, 0)?))?,
        "collapsePreferences" => {
            serde_json::to_value(collapse_preferences(&arg_preferences(args, 0)?))?
        }
        "mergeFacts" => serde_json::to_value(merge_facts(
            &arg_facts(args, 0)?,
            &arg_facts(args, 1)?,
            arg_str(args, 2)?,
        ))?,
        "mergePreferences" => serde_json::to_value(merge_preferences(
            &arg_preferences(args, 0)?,
            &arg_preferences(args, 1)?,
            arg_str(args, 2)?,
        ))?,
        "applyMemoryUpdate" => {
            let mut profile = arg_profile(args, 0)?;
            let changed = apply_memory_update(
                &mut profile,
                &arg_facts(args, 1)?,
                &arg_preferences(args, 2)?,
                arg_str(args, 3)?,
            );
            project_profile(&profile, Some(changed))
        }
        "applyForget" => {
            let mut profile = arg_profile(args, 0)?;
            let criteria: agents_core::memory::profile::ForgetCriteria =
                serde_json::from_value(arg(args, 1)?.clone())?;
            let result = apply_forget(&mut profile, &criteria, arg_str(args, 2)?);
            let mut value = json!({
                "removedFacts": result.removed_facts,
                "removedPreferences": result.removed_preferences,
            });
            if let Some(object) = value.as_object_mut() {
                object.extend(
                    project_profile(&profile, None)
                        .as_object()
                        .cloned()
                        .unwrap_or_default(),
                );
            }
            value
        }
        "profileContentFingerprint" => {
            serde_json::to_value(profile_content_fingerprint(&arg_profile(args, 0)?))?
        }
        "summaryNeedsRefresh" => {
            serde_json::to_value(summary_needs_refresh(&arg_profile(args, 0)?))?
        }
        "formatUserProfileForPrompt" => serde_json::to_value(format_user_profile_for_prompt(
            &arg_profile(args, 0)?,
            arg_str(args, 1)?,
        ))?,
        "buildPromptWithMemory" => {
            let profile = arg(args, 1)?;
            let profile = if profile.is_null() {
                None
            } else {
                Some(serde_json::from_value::<UserProfile>(profile.clone())?)
            };
            serde_json::to_value(build_prompt_with_memory(
                arg_str(args, 0)?,
                profile.as_ref(),
                arg_str(args, 2)?,
            ))?
        }
        "toFacts" => {
            let input: Vec<agents_core::memory::tools::SaveMemoryFact> =
                serde_json::from_value(arg(args, 0)?.clone())?;
            let mut id = ids();
            project_facts(&to_facts(
                &input,
                arg_str(args, 1)?,
                arg_str(args, 2)?,
                &mut id,
            ))
        }
        "toPreferences" => {
            let input: Vec<agents_core::memory::tools::SaveMemoryPreference> =
                serde_json::from_value(arg(args, 0)?.clone())?;
            let mut id = ids();
            project_preferences(&to_preferences(
                &input,
                arg_str(args, 1)?,
                arg_str(args, 2)?,
                &mut id,
            ))
        }
        "forgetCriteria" => {
            let input: ForgetMemoryInput = serde_json::from_value(arg(args, 0)?.clone())?;
            serde_json::to_value(forget_criteria(&input))?
        }
        "saveMemoryResult" => {
            let input: SaveMemoryInput = serde_json::from_value(arg(args, 0)?.clone())?;
            let mode = arg_str(args, 2)?;
            let errors = if mode == "fail" {
                vec!["profile: db down".to_owned()]
            } else {
                Vec::new()
            };
            let status = match mode {
                "no_profile" => StoredStatus::NotEnabled,
                "fail" => StoredStatus::Failed,
                _ => save_status(&input, args)?,
            };
            serde_json::to_value(save_memory_result(&input, status, &errors))?
        }
        "forgetMemoryResult" => {
            let input: ForgetMemoryInput = serde_json::from_value(arg(args, 0)?.clone())?;
            let criteria = forget_criteria(&input);
            let mode = arg_str(args, 2)?;
            let errors = if mode == "fail" {
                vec!["profile: db down".to_owned()]
            } else {
                Vec::new()
            };
            let (removed_facts, removed_preferences) = if mode == "ok" {
                let mut profile = arg_profile(args, 1)?;
                let result = apply_forget(&mut profile, &criteria, NOW);
                (result.removed_facts, result.removed_preferences)
            } else {
                (Vec::new(), Vec::new())
            };
            serde_json::to_value(forget_memory_result(
                &criteria,
                removed_facts,
                removed_preferences,
                &errors,
            ))?
        }
        "saveMemoryInputSchema" => serde_json::from_str(SAVE_MEMORY_INPUT_SCHEMA)?,
        "forgetMemoryInputSchema" => serde_json::from_str(FORGET_MEMORY_INPUT_SCHEMA)?,
        other => return Err(std::io::Error::other(format!("unknown function {other}")).into()),
    };
    Ok(value)
}

/// What the profile store did with a save, the way the old code decided it.
fn save_status(input: &SaveMemoryInput, args: &[Value]) -> Result<StoredStatus, Box<dyn Error>> {
    let facts = input.facts.as_deref().unwrap_or_default();
    let preferences = input.preferences.as_deref().unwrap_or_default();
    if facts.is_empty() && preferences.is_empty() {
        // The old code only wrote the profile when there was something to write.
        return Ok(StoredStatus::NotEnabled);
    }
    let mut profile = arg_profile(args, 1)?;
    let mut id = ids();
    let facts = to_facts(facts, "thread_oracle", NOW, &mut id);
    let preferences = to_preferences(preferences, "thread_oracle", NOW, &mut id);
    if apply_memory_update(&mut profile, &facts, &preferences, NOW) {
        Ok(StoredStatus::Saved)
    } else {
        Ok(StoredStatus::Unchanged)
    }
}

/// Compare two JSON values, treating `1` and `1.0` as the same number.
///
/// The old code wrote a confidence of `1` as `1` and the port writes `1.0`: JSON has no
/// way to tell an integer from a float, and `serde_json` keeps the difference. The numbers
/// are compared by value instead (differences.md, the row about the stored row).
fn same_json(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => match (left.as_f64(), right.as_f64()) {
            (Some(left), Some(right)) => left == right,
            _ => left == right,
        },
        (Value::Array(left), Value::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right.iter())
                    .all(|(left, right)| same_json(left, right))
        }
        (Value::Object(left), Value::Object(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .all(|(key, value)| right.get(key).is_some_and(|other| same_json(value, other)))
        }
        _ => left == right,
    }
}

#[test]
fn memory_cases_match_the_typescript_oracle() -> Result<(), Box<dyn Error>> {
    let text = fs::read_to_string(CASES)?;
    let mut checked = 0usize;

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let case: Value = serde_json::from_str(line)?;
        let name = case
            .get("fn")
            .and_then(Value::as_str)
            .ok_or_else(|| std::io::Error::other("a case has no function name"))?;
        let args = case
            .get("args")
            .and_then(Value::as_array)
            .ok_or_else(|| std::io::Error::other("a case has no arguments"))?;
        let expected = case
            .get("expected")
            .ok_or_else(|| std::io::Error::other("a case has no expected value"))?;
        let actual = dispatch(name, args)?;

        // The one deliberate difference: the date of the interaction history.
        if name == "formatUserProfileForPrompt" || name == "buildPromptWithMemory" {
            let actual_text = actual.as_str().unwrap_or_default();
            let expected_text = expected.as_str().unwrap_or_default();
            assert_eq!(
                without_last_date(actual_text),
                without_last_date(expected_text),
                "case {name} {args:?}"
            );
        } else {
            assert!(
                same_json(&actual, expected),
                "case {name} {args:?}\nactual:   {actual}\nexpected: {expected}"
            );
        }
        checked += 1;
    }

    assert!(checked >= 150, "only {checked} cases ran");
    Ok(())
}
