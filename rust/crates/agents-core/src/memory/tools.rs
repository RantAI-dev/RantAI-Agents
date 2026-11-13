//! The `saveMemory` and `forgetMemory` tools: their contract, their inputs and the result
//! they hand back to the model.
//!
//! Ported from `src/lib/memory/memory-tools.ts`. The tool descriptions and the memory
//! instruction are rewritten (QA TC-1548): the old ones told the model it "MUST call"
//! `saveMemory` on every correction, and the tools fired without being asked. Now the model
//! saves only when the user asks it to remember something or states a lasting personal fact
//! or preference about themselves, and forgets only on an explicit request. The old text is
//! in `docs/port/differences.md`.
//!
//! Working memory and semantic recall are out of scope for this port, so the tool input
//! still accepts `entities` but ignores them, and the result reports them as not enabled.

use serde::{Deserialize, Serialize};

use crate::memory::profile::{ForgetCriteria, RemovedItem};
use crate::memory::text::{js_trim, utf16_len};
use crate::memory::types::{Fact, Preference};

/// The name of the save tool.
pub const SAVE_MEMORY_TOOL_NAME: &str = "saveMemory";

/// The name of the forget tool.
pub const FORGET_MEMORY_TOOL_NAME: &str = "forgetMemory";

/// What the model is told the save tool does.
pub const SAVE_MEMORY_DESCRIPTION: &str = "Save a durable personal fact or preference that the user explicitly asks you to remember about themselves (for example \"remember that I live in Depok\" or \"save that I prefer email\"). A value for an existing label REPLACES the old value, so use it for updates and corrections too. Call it ONLY when the user asked you to remember something, or when they state a lasting personal fact or preference about themselves. DO NOT call it for search queries, conversation content, code, task instructions, or anything that is not a personal fact about the user.";

/// What the model is told the forget tool does.
pub const FORGET_MEMORY_DESCRIPTION: &str = "Delete personal memory you stored about the user before (locations, preferences, other personal data they asked you to remember). Call it ONLY when the user explicitly asks you to forget or delete what is stored about them, for example \"forget my location\" or \"hapus/lupakan data saya\". It returns exactly what was removed. DO NOT call it for generic delete commands (e.g. \"Tes hapus C\"), for deleting chat messages, artifacts, code or files, for search or web requests, or for test phrases; when in doubt, ask the user instead of calling.";

/// The instruction the chat surface appends to the system prompt.
pub const MEMORY_UPDATE_INSTRUCTION: &str = "\n\nMEMORY UPDATES: Save a personal fact or preference ONLY when the user explicitly asks you to remember it (\"remember that I live in Depok\", \"simpan bahwa saya prefer email\"), or when they state a lasting personal fact or preference about themselves that they want kept. Use saveMemory with the same label as the existing item (e.g. \"location\", \"favorite_color\") so the new value replaces the old one. Do not call it for ordinary conversation, for search requests, for code or task instructions, and never to record something the user did not ask you to keep. Only say it is saved if the tool result has success: true.\nMEMORY DELETION: Call forgetMemory ONLY when the user explicitly asks you to forget or delete what is stored about them (e.g. \"forget my location\", \"hapus data saya\", \"lupakan kota saya\") — keys for the topic (e.g. [\"location\"]), keywords for specific values (e.g. [\"Depok\"]), or all: true only if they ask to forget everything without naming a topic (\"lupakan semua informasi tentang lokasi saya\" names a topic → keys [\"location\"], not all: true). Do NOT call it for generic \"hapus\" commands about chat messages, code, artifacts, files, or web/search/test phrases (e.g. \"Tes hapus C\", \"Cari berita AI\"); when unsure whether the object is stored memory, ask the user instead of calling. Never claim something was forgotten or deleted without calling forgetMemory, and report the tool result truthfully: if it removed nothing, say nothing matching was stored; if it failed, say so.\nCURRENT VALUES: The stored profile holds the current value for each item. If older messages or memory mention a different value, the most recently updated value wins — use it and do not ask the user to choose.";

/// The JSON schema of the save tool input.
pub const SAVE_MEMORY_INPUT_SCHEMA: &str = r#"{"type":"object","properties":{"facts":{"type":"array","items":{"type":"object","properties":{"category":{"type":"string","description":"Category of fact (e.g. 'bio', 'work', 'family')"},"label":{"type":"string","description":"Label/Predicate (e.g. 'age', 'occupation', 'location'). Reuse the same label when updating a value — the new value replaces the old one."},"value":{"type":"string","description":"Value/Object (e.g. '30', 'Engineer')"},"confidence":{"type":"number","minimum":0,"maximum":1,"default":0.9}},"required":["category","label","value"],"additionalProperties":false}},"preferences":{"type":"array","items":{"type":"object","properties":{"category":{"type":"string","description":"Category (e.g. 'communication', 'product')"},"preference":{"type":"string","description":"Key (e.g. 'channel', 'insurance_type')"},"value":{"type":"string","description":"Value (e.g. 'email', 'life')"}},"required":["category","preference","value"],"additionalProperties":false}},"entities":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"Name of entity (person, organization, etc.)"},"type":{"type":"string","description":"Type of entity (Person, Organization, Date, Location)"}},"required":["name","type"],"additionalProperties":false}}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}"#;

/// The JSON schema of the forget tool input.
pub const FORGET_MEMORY_INPUT_SCHEMA: &str = r#"{"type":"object","properties":{"keys":{"type":"array","items":{"type":"string"},"description":"Labels/topics to forget, e.g. ['location'] for 'forget where I live', ['favorite_color']."},"keywords":{"type":"array","items":{"type":"string"},"description":"Specific values to forget wherever they are stored, e.g. ['Depok']."},"all":{"type":"boolean","description":"true ONLY when the user asks to forget everything about them with no topic named (\"forget everything about me\", \"hapus semua data saya\"). If they name a topic — even \"all information about my location\" / \"semua informasi tentang lokasi saya\" — use keys (e.g. ['location']) and leave this unset."}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}"#;

/// What the save tool takes.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveMemoryInput {
    pub facts: Option<Vec<SaveMemoryFact>>,
    pub preferences: Option<Vec<SaveMemoryPreference>>,
    /// Accepted for the old contract; working memory is out of scope, so these are ignored.
    pub entities: Option<Vec<SaveMemoryEntity>>,
}

/// One fact the model wants to store.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveMemoryFact {
    pub category: String,
    /// The predicate, e.g. "location".
    pub label: String,
    pub value: String,
    /// Defaults to 0.9 when the model leaves it out.
    pub confidence: Option<f64>,
}

/// One preference the model wants to store.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveMemoryPreference {
    pub category: String,
    /// The key, e.g. "channel".
    pub preference: String,
    pub value: String,
}

/// One entity the model wants to store. Ignored by this port.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveMemoryEntity {
    pub name: String,
    #[serde(rename = "type")]
    pub entity_type: String,
}

/// What the forget tool takes.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ForgetMemoryInput {
    pub keys: Option<Vec<String>>,
    pub keywords: Option<Vec<String>>,
    pub all: Option<bool>,
}

/// The facts the save tool produces.
///
/// The id comes from the caller: the old code used `fact_<nanoid(10)>`, and this crate
/// takes ids from its caller like everything else.
#[must_use]
pub fn to_facts(
    input: &[SaveMemoryFact],
    source: &str,
    now: &str,
    id: &mut dyn FnMut() -> String,
) -> Vec<Fact> {
    input
        .iter()
        .map(|fact| Fact {
            id: id(),
            subject: "user".to_owned(),
            predicate: if fact.label.is_empty() {
                "unknown".to_owned()
            } else {
                fact.label.clone()
            },
            object: if fact.value.is_empty() {
                "unknown".to_owned()
            } else {
                fact.value.clone()
            },
            confidence: fact.confidence.unwrap_or(0.9),
            source: source.to_owned(),
            created_at: Some(now.to_owned()),
            updated_at: Some(now.to_owned()),
        })
        .collect()
}

/// The preferences the save tool produces.
#[must_use]
pub fn to_preferences(
    input: &[SaveMemoryPreference],
    source: &str,
    now: &str,
    id: &mut dyn FnMut() -> String,
) -> Vec<Preference> {
    input
        .iter()
        .map(|preference| Preference {
            id: id(),
            category: if preference.category.is_empty() {
                "general".to_owned()
            } else {
                preference.category.clone()
            },
            key: if preference.preference.is_empty() {
                "unknown".to_owned()
            } else {
                preference.preference.clone()
            },
            value: if preference.value.is_empty() {
                "unknown".to_owned()
            } else {
                preference.value.clone()
            },
            confidence: 0.9,
            source: source.to_owned(),
            created_at: Some(now.to_owned()),
            updated_at: Some(now.to_owned()),
        })
        .collect()
}

/// The criteria the forget tool works with.
///
/// A key of nothing but spaces is dropped, and so is a keyword of one character: the old
/// code kept a key of one character but needed two for a keyword.
#[must_use]
pub fn forget_criteria(input: &ForgetMemoryInput) -> ForgetCriteria {
    ForgetCriteria {
        keys: input
            .keys
            .iter()
            .flatten()
            .filter(|key| !js_trim(key).is_empty())
            .cloned()
            .collect(),
        keywords: input
            .keywords
            .iter()
            .flatten()
            .filter(|keyword| utf16_len(js_trim(keyword)) > 1)
            .cloned()
            .collect(),
        all: input.all.unwrap_or(false),
    }
}

/// What a store did with the save.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StoredStatus {
    Saved,
    Unchanged,
    NotEnabled,
    Failed,
}

/// The stores the save tool wrote to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSummary {
    pub profile: StoredStatus,
    /// Always `not_enabled`: working memory is out of scope for this port.
    pub working_memory: StoredStatus,
}

/// How many items the save tool was given.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCounts {
    pub facts: usize,
    pub preferences: usize,
    pub entities: usize,
}

/// What the save tool hands back to the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMemoryResult {
    pub success: bool,
    pub stored: StoredSummary,
    pub items: StoredCounts,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// The result the save tool hands back.
///
/// `profile` is what the profile store did with the write, and `errors` are the failures
/// the caller collected (each one already says which store failed).
#[must_use]
pub fn save_memory_result(
    input: &SaveMemoryInput,
    profile: StoredStatus,
    errors: &[String],
) -> SaveMemoryResult {
    let items = StoredCounts {
        facts: input.facts.as_ref().map_or(0, Vec::len),
        preferences: input.preferences.as_ref().map_or(0, Vec::len),
        entities: input.entities.as_ref().map_or(0, Vec::len),
    };
    let error = (!errors.is_empty()).then(|| errors.join("; "));
    SaveMemoryResult {
        success: errors.is_empty(),
        stored: StoredSummary {
            profile,
            working_memory: StoredStatus::NotEnabled,
        },
        items,
        note: error
            .as_ref()
            .map(|_| "Not saved. Tell the user it could not be saved.".to_owned()),
        error,
    }
}

/// What happened to the semantic (vector) memory on a forget.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SemanticStatus {
    Deleted,
    #[default]
    Skipped,
    Failed,
}

/// What the forget removed.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedSummary {
    pub facts: Vec<RemovedItem>,
    pub preferences: Vec<RemovedItem>,
    /// Always 0: working memory is out of scope for this port.
    pub working_memory_items: usize,
    /// Always `skipped`: semantic recall is out of scope for this port.
    pub semantic_memory: SemanticStatus,
}

/// What the forget tool hands back to the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgetMemoryResult {
    pub success: bool,
    pub removed: RemovedSummary,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// The result the forget tool hands back.
///
/// The message is what the model reads, so it says plainly what happened.
#[must_use]
pub fn forget_memory_result(
    criteria: &ForgetCriteria,
    removed_facts: Vec<RemovedItem>,
    removed_preferences: Vec<RemovedItem>,
    errors: &[String],
) -> ForgetMemoryResult {
    if !criteria.all && criteria.keys.is_empty() && criteria.keywords.is_empty() {
        return ForgetMemoryResult {
            success: false,
            removed: RemovedSummary {
                semantic_memory: SemanticStatus::Skipped,
                ..RemovedSummary::default()
            },
            message: "Nothing was deleted: no keys, keywords, or all=true were given.".to_owned(),
            error: Some(
                "Nothing specified to forget. Pass keys, keywords, or all=true.".to_owned(),
            ),
        };
    }

    let total = removed_facts.len() + removed_preferences.len();
    let message = if !errors.is_empty() {
        "Deletion failed or was incomplete. Tell the user it could not be fully deleted."
    } else if total == 0 && !criteria.all {
        "No stored memory matched; nothing was deleted. Tell the user nothing matching was stored."
    } else {
        "Deleted. It will not be used in future conversations."
    };

    ForgetMemoryResult {
        success: errors.is_empty(),
        removed: RemovedSummary {
            facts: removed_facts,
            preferences: removed_preferences,
            working_memory_items: 0,
            semantic_memory: SemanticStatus::Skipped,
        },
        message: message.to_owned(),
        error: (!errors.is_empty()).then(|| errors.join("; ")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_descriptions_keep_the_negative_boundary() {
        let save = SAVE_MEMORY_DESCRIPTION.to_lowercase();
        let forget = FORGET_MEMORY_DESCRIPTION.to_lowercase();
        assert!(save.contains("personal"));
        assert!(forget.contains("personal"));
        assert!(save.contains("not call it for search queries"));
        assert!(forget.contains("not call it for generic delete commands"));
        assert!(forget.contains("test phrases"));
    }

    #[test]
    fn the_instruction_no_longer_says_the_model_must_call_the_tool() {
        assert!(!MEMORY_UPDATE_INSTRUCTION.contains("you MUST call"));
        assert!(MEMORY_UPDATE_INSTRUCTION.contains("explicitly asks you to remember"));
    }

    #[test]
    fn the_schemas_are_valid_json() -> Result<(), serde_json::Error> {
        let save: serde_json::Value = serde_json::from_str(SAVE_MEMORY_INPUT_SCHEMA)?;
        let forget: serde_json::Value = serde_json::from_str(FORGET_MEMORY_INPUT_SCHEMA)?;
        assert!(save.get("properties").is_some());
        assert!(forget.get("properties").is_some());
        Ok(())
    }

    #[test]
    fn a_fact_without_a_label_becomes_unknown() {
        let input = vec![SaveMemoryFact {
            category: "bio".to_owned(),
            label: String::new(),
            value: "Depok".to_owned(),
            confidence: None,
        }];
        let mut counter = 0;
        let facts = to_facts(&input, "thread", "2026-01-01T00:00:00.000Z", &mut || {
            counter += 1;
            format!("fact_{counter}")
        });
        assert_eq!(facts.first().map(|f| f.predicate.as_str()), Some("unknown"));
        assert_eq!(facts.first().map(|f| f.confidence), Some(0.9));
    }

    #[test]
    fn a_blank_key_is_dropped_and_a_one_character_keyword_is_dropped() {
        let input = ForgetMemoryInput {
            keys: Some(vec!["  ".to_owned(), "location".to_owned()]),
            keywords: Some(vec!["a".to_owned(), "Depok".to_owned()]),
            all: None,
        };
        let criteria = forget_criteria(&input);
        assert_eq!(criteria.keys, vec!["location".to_owned()]);
        assert_eq!(criteria.keywords, vec!["Depok".to_owned()]);
        assert!(!criteria.all);
    }

    #[test]
    fn an_empty_forget_request_is_refused() {
        let result = forget_memory_result(&ForgetCriteria::default(), Vec::new(), Vec::new(), &[]);
        assert!(!result.success);
        assert!(result.message.contains("Nothing was deleted"));
        assert!(result.error.is_some());
    }
}
