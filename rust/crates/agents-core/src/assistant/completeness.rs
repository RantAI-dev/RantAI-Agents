//! How complete an assistant draft is, per builder tab, and whether it can be deployed.
//!
//! Ported from `src/features/assistants/core/completeness.ts`. The length checks used
//! JavaScript `.length` there, so they count UTF-16 code units (not code points like the
//! zod schema in `assistant/input.rs`).

use serde::{Deserialize, Serialize};
use serde_json::Map;

use crate::memory::text::{js_trim, utf16_len};

/// The builder tabs, in the ids the frontend uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TabId {
    Configure,
    Model,
    Tools,
    Skills,
    Workflows,
    Mcp,
    Knowledge,
    Memory,
    Guardrails,
    Chat,
    Test,
    Deploy,
}

impl TabId {
    /// The tab id a URL or payload carries; an unknown id is not a tab.
    #[must_use]
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "configure" => Some(Self::Configure),
            "model" => Some(Self::Model),
            "tools" => Some(Self::Tools),
            "skills" => Some(Self::Skills),
            "workflows" => Some(Self::Workflows),
            "mcp" => Some(Self::Mcp),
            "knowledge" => Some(Self::Knowledge),
            "memory" => Some(Self::Memory),
            "guardrails" => Some(Self::Guardrails),
            "chat" => Some(Self::Chat),
            "test" => Some(Self::Test),
            "deploy" => Some(Self::Deploy),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TabStatus {
    RequiredMissing,
    Filled,
    Empty,
}

/// The JSON config columns, as the builder form holds them: content of any kind means the
/// tab was touched. Only their key count matters, so they are plain objects here.
pub type ConfigObject = Map<String, serde_json::Value>;

/// The builder form state the completeness checks read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CompletenessFormState {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub model: String,
    pub opening_message: String,
    pub opening_questions: Vec<String>,
    pub live_chat_enabled: bool,
    pub selected_tool_ids: Vec<String>,
    pub selected_skill_ids: Vec<String>,
    pub selected_mcp_server_ids: Vec<String>,
    pub selected_workflow_ids: Vec<String>,
    pub use_knowledge_base: bool,
    pub knowledge_base_group_ids: Vec<String>,
    pub memory_config: ConfigObject,
    pub model_config: ConfigObject,
    pub chat_config: ConfigObject,
    pub guard_rails: ConfigObject,
    pub available_model_ids: Vec<String>,
}

impl Default for CompletenessFormState {
    /// Every list empty, every flag off, every config object `{}`.
    fn default() -> Self {
        Self {
            name: String::new(),
            description: String::new(),
            system_prompt: String::new(),
            model: String::new(),
            opening_message: String::new(),
            opening_questions: Vec::new(),
            live_chat_enabled: false,
            selected_tool_ids: Vec::new(),
            selected_skill_ids: Vec::new(),
            selected_mcp_server_ids: Vec::new(),
            selected_workflow_ids: Vec::new(),
            use_knowledge_base: false,
            knowledge_base_group_ids: Vec::new(),
            memory_config: Map::new(),
            model_config: Map::new(),
            chat_config: Map::new(),
            guard_rails: Map::new(),
            available_model_ids: Vec::new(),
        }
    }
}

/// A name the user typed is valid when something non-whitespace remains after trimming.
#[must_use]
pub fn is_name_valid(name: &str) -> bool {
    utf16_len(js_trim(name)) > 0
}

/// The system prompt is valid from 20 UTF-16 units, trimmed.
#[must_use]
pub fn is_system_prompt_valid(prompt: &str) -> bool {
    utf16_len(js_trim(prompt)) >= 20
}

/// The chosen model must be one the org actually has.
#[must_use]
pub fn is_model_valid(model: &str, available_ids: &[String]) -> bool {
    available_ids.iter().any(|id| id == model)
}

fn has_any_content(config: &ConfigObject) -> bool {
    !config.is_empty()
}

/// The tab's completion dot: a required field missing, filled, or nothing selected.
#[must_use]
pub fn compute_tab_status(form: &CompletenessFormState, tab: TabId) -> TabStatus {
    match tab {
        TabId::Configure => {
            if is_name_valid(&form.name) && is_system_prompt_valid(&form.system_prompt) {
                TabStatus::Filled
            } else {
                TabStatus::RequiredMissing
            }
        }
        TabId::Model => {
            if is_model_valid(&form.model, &form.available_model_ids) {
                TabStatus::Filled
            } else {
                TabStatus::RequiredMissing
            }
        }
        TabId::Tools => tab_filled_or_empty(!form.selected_tool_ids.is_empty()),
        TabId::Skills => tab_filled_or_empty(!form.selected_skill_ids.is_empty()),
        TabId::Workflows => tab_filled_or_empty(!form.selected_workflow_ids.is_empty()),
        TabId::Mcp => tab_filled_or_empty(!form.selected_mcp_server_ids.is_empty()),
        TabId::Knowledge => tab_filled_or_empty(
            form.use_knowledge_base && !form.knowledge_base_group_ids.is_empty(),
        ),
        TabId::Memory => tab_filled_or_empty(has_any_content(&form.memory_config)),
        TabId::Guardrails => tab_filled_or_empty(has_any_content(&form.guard_rails)),
        TabId::Chat => tab_filled_or_empty(has_any_content(&form.chat_config)),
        TabId::Test | TabId::Deploy => TabStatus::Empty,
    }
}

fn tab_filled_or_empty(filled: bool) -> TabStatus {
    if filled {
        TabStatus::Filled
    } else {
        TabStatus::Empty
    }
}

/// What is still missing before the assistant can go live.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployReadiness {
    pub ok: bool,
    pub missing: Vec<MissingField>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MissingField {
    Name,
    SystemPrompt,
    Model,
    OpeningMessage,
}

#[must_use]
pub fn is_deploy_ready(form: &CompletenessFormState) -> DeployReadiness {
    let mut missing = Vec::new();
    if !is_name_valid(&form.name) {
        missing.push(MissingField::Name);
    }
    if !is_system_prompt_valid(&form.system_prompt) {
        missing.push(MissingField::SystemPrompt);
    }
    if !is_model_valid(&form.model, &form.available_model_ids) {
        missing.push(MissingField::Model);
    }
    if form.live_chat_enabled && utf16_len(js_trim(&form.opening_message)) == 0 {
        missing.push(MissingField::OpeningMessage);
    }
    DeployReadiness {
        ok: missing.is_empty(),
        missing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::error::Error;

    fn empty_form() -> Result<CompletenessFormState, Box<dyn Error>> {
        Ok(serde_json::from_value(json!({
            "availableModelIds": ["openai/gpt-5.2"]
        }))?)
    }

    #[test]
    fn names_and_prompts() -> Result<(), Box<dyn Error>> {
        assert!(!is_name_valid("   "));
        assert!(is_name_valid("My Agent"));
        assert!(!is_system_prompt_valid("short"));
        assert!(is_system_prompt_valid("xxxxxxxxxxxxxxxxxxxx"));
        // 20 UTF-16 units: two-decode-unit characters count twice here, unlike the schema.
        let emoji_prompt = "\u{1F600}".repeat(10);
        assert!(is_system_prompt_valid(&emoji_prompt));
        Ok(())
    }

    #[test]
    fn tabs_and_deploy() -> Result<(), Box<dyn Error>> {
        let mut form = empty_form()?;
        form.name = "Agent".to_owned();
        form.system_prompt = "xxxxxxxxxxxxxxxxxxxx".to_owned();
        form.model = "openai/gpt-5.2".to_owned();
        assert_eq!(
            compute_tab_status(&form, TabId::Configure),
            TabStatus::Filled
        );
        assert_eq!(compute_tab_status(&form, TabId::Tools), TabStatus::Empty);
        form.selected_tool_ids = vec!["t1".to_owned()];
        assert_eq!(compute_tab_status(&form, TabId::Tools), TabStatus::Filled);
        let readiness = is_deploy_ready(&form);
        assert!(readiness.ok);
        assert!(readiness.missing.is_empty());

        let bare = empty_form()?;
        let readiness = is_deploy_ready(&bare);
        assert!(!readiness.ok);
        assert_eq!(
            readiness.missing,
            vec![
                MissingField::Name,
                MissingField::SystemPrompt,
                MissingField::Model
            ]
        );
        Ok(())
    }
}
