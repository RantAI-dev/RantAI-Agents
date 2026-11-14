//! The long-term memory of a chat: the profile, the two memory tools and the post-stream
//! update.
//!
//! Old: `src/lib/memory/long-term-memory.ts` (`mutateUserProfile`, `saveToUserProfile`,
//! `forgetFromUserProfile`, `updateUserProfile`, `refreshInteractionSummary`) and
//! `src/lib/memory/memory-tools.ts`.
//!
//! The profile row is written with a compare-and-swap on `updatedAt` and retried when another
//! writer won: the in-process lock the TypeScript used does not hold across instances
//! (docs/port/differences.md, row 1). Working memory and semantic recall are not ported (row 3),
//! so the profile only changes through the two memory tools and the summary.

use std::future::Future;
use std::pin::Pin;

use agents_core::memory::profile::{
    ForgetCriteria, ForgetResult, apply_forget, apply_memory_update, profile_content_fingerprint,
};
use agents_core::memory::tools::{
    FORGET_MEMORY_DESCRIPTION, FORGET_MEMORY_INPUT_SCHEMA, FORGET_MEMORY_TOOL_NAME,
    ForgetMemoryInput, SAVE_MEMORY_DESCRIPTION, SAVE_MEMORY_INPUT_SCHEMA, SAVE_MEMORY_TOOL_NAME,
    SaveMemoryInput, StoredStatus, forget_criteria, forget_memory_result, save_memory_result,
    to_facts, to_preferences,
};
use agents_core::memory::types::{Fact, Preference, UserProfile};
use agents_llm::agent_loop::{ToolExecutor, ToolOutcome};
use agents_llm::types::{ToolCall, ToolDefinition};
use serde_json::Value;
use sqlx::PgPool;

use agents_store::memory;
use agents_store::{StoreError, StoreResult, new_id};

/// How many times a writer retries when another writer changed the row first.
///
/// The TypeScript retried eight times as well (`MAX_CAS_ATTEMPTS`).
const MAX_CAS_ATTEMPTS: usize = 8;

/// The user's profile, or `None` when they have none yet.
pub async fn load_profile(db: &PgPool, user_id: &str) -> StoreResult<Option<UserProfile>> {
    let Some((value, _)) = memory::load_profile(db, user_id).await? else {
        return Ok(None);
    };
    Ok(Some(profile_from_value(&value, user_id)))
}

/// A row that cannot be read as a profile is an empty profile, not a failure: a chat request
/// must not fail over a row that is slightly off.
fn profile_from_value(value: &Value, user_id: &str) -> UserProfile {
    serde_json::from_value(value.clone()).unwrap_or_else(|_| {
        UserProfile::new(
            memory::profile_id(user_id),
            user_id,
            "1970-01-01T00:00:00.000Z",
        )
    })
}

/// Reads the profile, changes it and writes it back, retrying when another writer won.
///
/// The mutator may run more than once; it must only use the profile it is given. Returning
/// `false` skips the write.
pub async fn mutate_profile<F>(
    db: &PgPool,
    user_id: &str,
    now: &str,
    mut mutate: F,
) -> StoreResult<UserProfile>
where
    F: FnMut(&mut UserProfile) -> bool,
{
    for attempt in 0..MAX_CAS_ATTEMPTS {
        let loaded = memory::load_profile(db, user_id).await?;
        let mut profile = match &loaded {
            Some((value, _)) => profile_from_value(value, user_id),
            None => UserProfile::new(memory::profile_id(user_id), user_id, now),
        };
        if !mutate(&mut profile) {
            return Ok(profile);
        }
        let value = serde_json::to_value(&profile)
            .map_err(|error| StoreError::Db(sqlx::Error::Protocol(error.to_string())))?;
        let expected = loaded.map(|(_, version)| version);
        match memory::save_profile(db, user_id, &value, expected).await {
            Ok(_) => return Ok(profile),
            Err(StoreError::Conflict) => {
                // Another writer got there first: wait a moment and read the row again.
                tokio::time::sleep(backoff(attempt)).await;
            }
            Err(error) => return Err(error),
        }
    }
    Err(StoreError::Conflict)
}

/// The wait before a writer reads the row again.
///
/// The old code waited 5 to 25 milliseconds, picked at random so two writers do not retry in
/// lockstep. The port waits longer as the attempts pile up: every chat of a user writes the
/// same row, and a writer that keeps losing the race must still get its change in.
fn backoff(attempt: usize) -> std::time::Duration {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.subsec_nanos() as u64)
        .unwrap_or(0);
    let counter = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let spread = (nanos ^ counter.wrapping_mul(0x9E37_79B9_7F4A_7C15)) % 50;
    std::time::Duration::from_millis(5 + attempt as u64 * 15 + spread)
}

/// The `saveMemory` tool: writes the facts and preferences the model asked for.
pub async fn save(
    db: &PgPool,
    user_id: &str,
    facts: &[Fact],
    preferences: &[Preference],
    now: &str,
) -> StoreResult<(UserProfile, bool)> {
    let mut changed = false;
    let profile = mutate_profile(db, user_id, now, |profile| {
        changed = apply_memory_update(profile, facts, preferences, now);
        changed
    })
    .await?;
    Ok((profile, changed))
}

/// The `forgetMemory` tool: removes the facts and preferences that match.
pub async fn forget(
    db: &PgPool,
    user_id: &str,
    criteria: &ForgetCriteria,
    now: &str,
) -> StoreResult<ForgetResult> {
    let mut result = ForgetResult::default();
    mutate_profile(db, user_id, now, |profile| {
        result = apply_forget(profile, criteria, now);
        !result.removed_facts.is_empty() || !result.removed_preferences.is_empty() || criteria.all
    })
    .await?;
    Ok(result)
}

/// The post-stream update: the turn is counted and the profile is stamped.
///
/// The regex extractors of the TypeScript are not ported (docs/port/differences.md, row 3), so
/// no fact is added here: the profile changes through the memory tools and the summary.
pub async fn drain(db: &PgPool, user_id: &str, now: &str) -> StoreResult<UserProfile> {
    mutate_profile(db, user_id, now, |profile| {
        apply_memory_update(profile, &[], &[], now);
        profile.total_conversations += 1;
        profile.last_interaction_at = Some(now.to_owned());
        profile.updated_at = Some(now.to_owned());
        true
    })
    .await
}

/// Writes the summary, but only when the remembered content did not change while it was
/// written: a summary must never describe data that was since updated or forgotten.
///
/// The fingerprint is the one of the profile the summary was written from.
pub async fn write_summary(
    db: &PgPool,
    user_id: &str,
    now: &str,
    fingerprint: &str,
    summary: &str,
) -> StoreResult<()> {
    let Some(current) = load_profile(db, user_id).await? else {
        return Ok(());
    };
    if profile_content_fingerprint(&current) != fingerprint {
        return Ok(());
    }
    mutate_profile(db, user_id, now, |profile| {
        profile.interaction_summary = summary.to_owned();
        true
    })
    .await?;
    Ok(())
}

/// The memory tools, as the model is told about them.
pub fn definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: SAVE_MEMORY_TOOL_NAME.to_owned(),
            description: Some(SAVE_MEMORY_DESCRIPTION.to_owned()),
            parameters: schema(SAVE_MEMORY_INPUT_SCHEMA),
        },
        ToolDefinition {
            name: FORGET_MEMORY_TOOL_NAME.to_owned(),
            description: Some(FORGET_MEMORY_DESCRIPTION.to_owned()),
            parameters: schema(FORGET_MEMORY_INPUT_SCHEMA),
        },
    ]
}

/// A tool's input schema. The schemas are JSON constants, so they parse.
fn schema(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or(Value::Null)
}

/// The memory tools: what the model calls to change the profile.
pub struct MemoryTools {
    db: PgPool,
    user_id: String,
    now: String,
}

impl MemoryTools {
    /// The tools for one user.
    pub fn new(db: PgPool, user_id: impl Into<String>, now: impl Into<String>) -> Self {
        Self {
            db,
            user_id: user_id.into(),
            now: now.into(),
        }
    }
}

impl ToolExecutor for MemoryTools {
    fn execute<'a>(
        &'a self,
        call: &'a ToolCall,
    ) -> Pin<Box<dyn Future<Output = ToolOutcome> + Send + 'a>> {
        Box::pin(async move {
            match call.name.as_str() {
                SAVE_MEMORY_TOOL_NAME => self.save(&call.args).await,
                FORGET_MEMORY_TOOL_NAME => self.forget(&call.args).await,
                other => ToolOutcome::Failed {
                    message: format!("There is no tool called {other}."),
                },
            }
        })
    }
}

impl MemoryTools {
    /// Writes what the model asked to remember.
    async fn save(&self, args: &Value) -> ToolOutcome {
        let input: SaveMemoryInput = match serde_json::from_value(args.clone()) {
            Ok(input) => input,
            Err(error) => {
                return ToolOutcome::Failed {
                    message: format!(
                        "The memory tool was called with arguments it cannot read: {error}"
                    ),
                };
            }
        };
        let mut fact_counter = 0_u32;
        let mut next_fact_id = || {
            fact_counter += 1;
            format!("fact_{}_{fact_counter}", new_id())
        };
        let facts = to_facts(
            input.facts.as_deref().unwrap_or(&[]),
            &self.now,
            &self.now,
            &mut next_fact_id,
        );
        let mut preference_counter = 0_u32;
        let mut next_preference_id = || {
            preference_counter += 1;
            format!("pref_{}_{preference_counter}", new_id())
        };
        let preferences = to_preferences(
            input.preferences.as_deref().unwrap_or(&[]),
            &self.now,
            &self.now,
            &mut next_preference_id,
        );
        let (_profile, changed) =
            match save(&self.db, &self.user_id, &facts, &preferences, &self.now).await {
                Ok(result) => result,
                Err(error) => {
                    tracing::error!(error = %error, "the memory tool could not write the profile");
                    return ToolOutcome::Failed {
                        message: "The memory could not be saved.".to_owned(),
                    };
                }
            };
        let status = if changed {
            StoredStatus::Saved
        } else {
            StoredStatus::Unchanged
        };
        let result = save_memory_result(&input, status, &[]);
        ToolOutcome::Completed {
            content: serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_owned()),
        }
    }

    /// Removes what the model was asked to forget.
    async fn forget(&self, args: &Value) -> ToolOutcome {
        let input: ForgetMemoryInput = match serde_json::from_value(args.clone()) {
            Ok(input) => input,
            Err(error) => {
                return ToolOutcome::Failed {
                    message: format!(
                        "The memory tool was called with arguments it cannot read: {error}"
                    ),
                };
            }
        };
        let criteria = forget_criteria(&input);
        let removed = match forget(&self.db, &self.user_id, &criteria, &self.now).await {
            Ok(removed) => removed,
            Err(error) => {
                tracing::error!(error = %error, "the memory tool could not write the profile");
                return ToolOutcome::Failed {
                    message: "The memory could not be deleted.".to_owned(),
                };
            }
        };
        let result = forget_memory_result(
            &criteria,
            removed.removed_facts,
            removed.removed_preferences,
            &[],
        );
        ToolOutcome::Completed {
            content: serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_owned()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agents_core::memory::tools::{SaveMemoryFact, SaveMemoryPreference};

    #[test]
    fn the_two_memory_tools_are_offered() {
        let definitions = definitions();
        assert_eq!(definitions.len(), 2);
        assert_eq!(
            definitions.first().map(|d| d.name.as_str()),
            Some("saveMemory")
        );
        assert_eq!(
            definitions.get(1).map(|d| d.name.as_str()),
            Some("forgetMemory")
        );
        assert!(
            definitions
                .first()
                .and_then(|d| d.parameters.get("properties"))
                .is_some()
        );
    }

    #[test]
    fn a_saved_fact_carries_the_predicate_and_the_value() {
        let input = vec![SaveMemoryFact {
            category: "bio".to_owned(),
            label: "location".to_owned(),
            value: "Depok".to_owned(),
            confidence: None,
        }];
        let facts = to_facts(&input, "thread", "2026-01-01T00:00:00.000Z", &mut || {
            "fact_1".to_owned()
        });
        assert_eq!(
            facts.first().map(|f| f.predicate.as_str()),
            Some("location")
        );
        assert_eq!(facts.first().map(|f| f.object.as_str()), Some("Depok"));
        assert_eq!(facts.first().map(|f| f.confidence), Some(0.9));
    }

    #[test]
    fn a_saved_preference_carries_the_key_and_the_value() {
        let input = vec![SaveMemoryPreference {
            category: "communication".to_owned(),
            preference: "channel".to_owned(),
            value: "email".to_owned(),
        }];
        let preferences = to_preferences(&input, "thread", "2026-01-01T00:00:00.000Z", &mut || {
            "pref_1".to_owned()
        });
        assert_eq!(preferences.first().map(|p| p.key.as_str()), Some("channel"));
        assert_eq!(preferences.first().map(|p| p.value.as_str()), Some("email"));
    }
}
