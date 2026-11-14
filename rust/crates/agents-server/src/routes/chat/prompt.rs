//! The system prompt of a plain chat.
//!
//! Old: `runChat` in `src/features/chat-public/service.ts` (the prompt lines 404–481, 969–978
//! and 1239–1272) and `src/lib/prompts/*`.
//!
//! The order is the old order, because the model reads it as one document:
//! 1. the assistant's own prompt,
//! 2. the live-chat handoff instruction,
//! 3. the memory sections (the profile) and the memory instruction,
//! 4. the tool instruction, when the assistant has tools (D3),
//! 5. the `{{variable}}` placeholders,
//! 6. the language rule and the output-hygiene rule,
//! 7. the identity and the date,
//! 8. the guard rails,
//! 9. the response format.

use agents_core::assistant::config::{MemoryConfig, ModelConfig, ResponseFormat};
use agents_core::memory::prompt::build_prompt_with_memory;
use agents_core::memory::tools::MEMORY_UPDATE_INSTRUCTION;
use agents_core::memory::types::UserProfile;
use agents_core::prompt::guard_rails::build_guard_rails_prompt;
use agents_core::prompt::instructions::{
    ArtifactContext, LANGUAGE_INSTRUCTION, LIVE_CHAT_HANDOFF_INSTRUCTION,
    OUTPUT_HYGIENE_INSTRUCTION, PlatformContext, ToolInstructionOptions,
    build_platform_context_instruction, build_tool_instruction,
};
use agents_core::prompt::response_format::get_response_format_instruction;
use agents_core::prompt::variables::{VariableContext, resolve_prompt_variables};
use serde_json::Value;

/// The prompt a chat without an assistant of its own uses.
pub const BASE_SYSTEM_PROMPT: &str = "You are a helpful AI assistant. Answer questions accurately, concisely, and helpfully. Be friendly and professional.";

/// What the assistant brings to the prompt.
#[derive(Debug, Clone, Default)]
pub struct AssistantPrompt {
    /// The assistant's name, for the identity block.
    pub name: Option<String>,
    /// The assistant's own prompt.
    pub system_prompt: String,
    /// Whether the live-chat handoff instruction is appended.
    pub live_chat_enabled: bool,
    /// The guard rails column, as it is stored.
    pub guard_rails: Option<Value>,
    /// The model config column, read leniently.
    pub model_config: ModelConfig,
    /// The memory config column, read leniently.
    pub memory_config: MemoryConfig,
}

/// Everything the prompt needs that is not the assistant.
pub struct PromptContext<'a> {
    /// The user's profile, when the long-term memory is on and the user has one.
    pub profile: Option<&'a UserProfile>,
    /// The name the `{{user_name}}` placeholder resolves to.
    pub user_name: Option<&'a str>,
    /// The name of the model, for the identity block.
    pub model_name: Option<&'a str>,
    /// The current instant, as an ISO-8601 string.
    pub now: &'a str,
    /// Whether the identity and date block is part of the prompt.
    pub platform_context: bool,
    /// The assistant's tools the model is offered, not counting the memory tools.
    pub tool_names: &'a [String],
}

/// The system prompt of one chat.
#[must_use]
pub fn build(assistant: Option<&AssistantPrompt>, context: &PromptContext<'_>) -> String {
    let mut system = assistant
        .map(|assistant| assistant.system_prompt.clone())
        .unwrap_or_else(|| BASE_SYSTEM_PROMPT.to_owned());

    if assistant.is_some_and(|assistant| assistant.live_chat_enabled) {
        system.push_str(LIVE_CHAT_HANDOFF_INSTRUCTION);
    }

    let memory = assistant.map_or_else(MemoryConfig::default, |a| a.memory_config.clone());
    if memory.enabled {
        system = build_prompt_with_memory(&system, context.profile, context.now);
        system.push_str(MEMORY_UPDATE_INSTRUCTION);
        if let Some(instructions) = memory.memory_instructions.as_deref() {
            system.push_str("\n\nMemory Instructions:\n");
            system.push_str(instructions);
        }
    }

    if !context.tool_names.is_empty() {
        // No canvas mode and no artifact tools reach the Rust chat, so the artifact parts of
        // the instruction are empty.
        system.push_str(&build_tool_instruction(
            context.tool_names,
            &ToolInstructionOptions::default(),
            &ArtifactContext::default(),
        ));
    }

    system = resolve_prompt_variables(
        &system,
        &VariableContext {
            user_name: context.user_name.map(str::to_owned),
            ..VariableContext::default()
        },
        context.now,
    );

    system.push_str(LANGUAGE_INSTRUCTION);
    system.push_str(OUTPUT_HYGIENE_INSTRUCTION);

    if context.platform_context {
        system.push_str(&build_platform_context_instruction(&PlatformContext {
            assistant_name: assistant.and_then(|assistant| assistant.name.as_deref()),
            model_name: context.model_name,
            now: context.now,
        }));
    }

    if let Some(guard_rails) = assistant.and_then(|assistant| assistant.guard_rails.as_ref()) {
        system.push_str(&build_guard_rails_prompt(Some(guard_rails)));
    }

    if let Some(format) = assistant
        .and_then(|assistant| assistant.model_config.response_format)
        .filter(|format| *format != ResponseFormat::Default)
    {
        system.push_str(&get_response_format_instruction(Some(format.as_str())));
    }

    system
}

#[cfg(test)]
mod tests {
    use super::*;
    use agents_core::assistant::config::ResponseFormat;
    use agents_core::memory::types::Fact;
    use serde_json::json;

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
                updated_at: None,
            }],
            preferences: vec![],
            interaction_summary: String::new(),
            total_conversations: 1,
            last_interaction_at: Some("2026-09-01T00:00:00.000Z".to_owned()),
            created_at: Some("2026-01-01T00:00:00.000Z".to_owned()),
            updated_at: None,
        }
    }

    fn context<'a>(profile: Option<&'a UserProfile>) -> PromptContext<'a> {
        PromptContext {
            profile,
            user_name: Some("Budi"),
            model_name: Some("RantAI Nano"),
            now: "2026-11-14T08:30:00.000Z",
            platform_context: true,
            tool_names: &[],
        }
    }

    #[test]
    fn the_tool_instruction_comes_before_the_variables_and_only_with_tools() {
        let assistant = AssistantPrompt {
            system_prompt: "Answer {{user_name}}.".to_owned(),
            ..AssistantPrompt::default()
        };
        let names = vec!["calculator".to_owned(), "date_time".to_owned()];
        let with_tools = build(
            Some(&assistant),
            &PromptContext {
                tool_names: &names,
                ..context(None)
            },
        );
        let at = with_tools
            .find("You have these tools: calculator, date_time.")
            .unwrap_or(usize::MAX);
        let language = with_tools.find(LANGUAGE_INSTRUCTION.trim()).unwrap_or(0);
        assert!(at < language, "{with_tools}");
        assert!(with_tools.starts_with("Answer Budi."));
        let without = build(Some(&assistant), &context(None));
        assert!(!without.contains("## Available Tools"));
    }

    #[test]
    fn the_prompt_carries_the_assistant_the_profile_and_the_guard_rails() {
        let assistant = AssistantPrompt {
            name: Some("Budi Helper".to_owned()),
            system_prompt: "You are Budi's helper.".to_owned(),
            live_chat_enabled: false,
            guard_rails: Some(json!({"blockedTopics": ["politics"]})),
            model_config: ModelConfig::default(),
            memory_config: MemoryConfig::default(),
        };
        let prompt = build(Some(&assistant), &context(Some(&profile())));
        assert!(prompt.starts_with("You are Budi's helper."));
        assert!(prompt.contains("--- Long-term User Profile ---"));
        assert!(prompt.contains("location: Depok"));
        assert!(prompt.contains("SAFETY RULES:"));
        assert!(prompt.contains("politics"));
        assert!(prompt.contains("You are Budi Helper, an AI assistant on the RantAI platform."));
        assert!(prompt.contains("Today is Saturday, 14 November 2026, 08:30 (UTC)."));
        // The memory instruction asks for an explicit request, not every correction.
        assert!(prompt.contains("MEMORY UPDATES:"));
    }

    #[test]
    fn the_variables_are_resolved_before_the_rules_are_appended() {
        let assistant = AssistantPrompt {
            system_prompt: "Hello {{user_name}} on {{date}}.".to_owned(),
            ..AssistantPrompt::default()
        };
        let prompt = build(Some(&assistant), &context(None));
        assert!(prompt.contains("Hello Budi on 2026-11-14."));
    }

    #[test]
    fn the_response_format_is_appended_last() {
        let assistant = AssistantPrompt {
            system_prompt: "Answer.".to_owned(),
            model_config: ModelConfig {
                response_format: Some(ResponseFormat::Json),
                ..ModelConfig::default()
            },
            ..AssistantPrompt::default()
        };
        let prompt = build(Some(&assistant), &context(None));
        assert!(prompt.contains("RESPONSE FORMAT: Always respond with valid JSON."));
    }

    #[test]
    fn a_chat_without_an_assistant_uses_the_base_prompt() {
        let prompt = build(None, &context(None));
        assert!(prompt.starts_with(BASE_SYSTEM_PROMPT));
    }

    #[test]
    fn the_live_chat_handoff_is_only_appended_when_it_is_on() {
        let assistant = AssistantPrompt {
            system_prompt: "Answer.".to_owned(),
            live_chat_enabled: true,
            ..AssistantPrompt::default()
        };
        let prompt = build(Some(&assistant), &context(None));
        assert!(prompt.contains("LIVE CHAT HANDOFF:"));
    }

    #[test]
    fn a_memory_that_is_off_adds_no_profile_and_no_instruction() {
        let assistant = AssistantPrompt {
            system_prompt: "Answer.".to_owned(),
            memory_config: MemoryConfig {
                enabled: false,
                ..MemoryConfig::default()
            },
            ..AssistantPrompt::default()
        };
        let prompt = build(Some(&assistant), &context(Some(&profile())));
        assert!(!prompt.contains("--- Long-term User Profile ---"));
        assert!(!prompt.contains("MEMORY UPDATES:"));
    }
}
