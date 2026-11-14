//! One turn of an agent API call, prepared.
//!
//! Both transports (§3.6: `POST /v1/chat/completions` and the WebSocket) reach the same agent
//! through the same gate, the same prompt and the same tools as the dashboard chat. This module
//! is the part they share; each transport then runs the loop and frames the answer its own way
//! (OpenAI chunks for HTTP, the UI-stream chunks for the socket).
//!
//! What is granted, what the agent may use and what the port cannot do is decided here and
//! nowhere else, so the two transports cannot drift apart.

use std::sync::Arc;

use serde_json::Value;

use agents_contracts::error_codes::ErrorCode;
use agents_core::assistant::config::ModelConfig;
use agents_core::chat::step_budget::resolve_max_steps;
use agents_core::prompt::approval::resolve_tool_approval_mode;
use agents_llm::agent_loop::ToolExecutor;
use agents_llm::client::Cancel;
use agents_llm::provider::Provider;
use agents_llm::types::{ChatRequest as LlmRequest, ToolChoice};
use agents_store::assistants::AssistantRow;

use crate::AppState;
use crate::http::ApiError;
use crate::policy::{ChatContext, ChatMeter};
use crate::routes::chat::{
    DEFAULT_MODEL, assistant_prompt, check_capabilities, llm_error, model_messages, prompt,
    request, tools,
};

use super::key_auth::KeyCaller;

/// Everything one turn needs, once the gate has passed.
pub struct Prepared {
    pub provider: Provider,
    /// The model the agent answers with, as the client sees it in the answer.
    pub model_id: String,
    pub request: LlmRequest,
    /// The tools, for the frames of a call the model was not offered.
    pub tools: Arc<tools::ChatTools>,
    pub executor: Arc<dyn ToolExecutor>,
    pub max_steps: usize,
    pub cancel: Cancel,
    pub meter: Arc<dyn ChatMeter>,
    pub context: Context,
}

/// The meter's context, owned so it outlives the borrow of the request.
pub struct Context {
    pub user_id: String,
    pub organization_id: Option<String>,
    pub assistant_id: Option<String>,
    pub model: String,
}

impl Context {
    /// The context as the meter reads it.
    pub fn as_context(&self) -> ChatContext<'_> {
        ChatContext {
            user_id: &self.user_id,
            organization_id: self.organization_id.as_deref(),
            assistant_id: self.assistant_id.as_deref(),
            model: &self.model,
        }
    }
}

/// Prepares one turn: the capability gate, the tools, the model, the prompt and the plan.
///
/// The conversation is the caller's: HTTP replays it in every request, the socket keeps it.
///
/// # Errors
/// A 409 `capability_not_ported` when the agent needs something this phase does not have (the
/// knowledge base, MCP, a workflow, a chatflow, an unported tool or skill), and whatever the
/// model router or the meter refuses.
pub async fn prepare(
    state: &AppState,
    caller: &KeyCaller,
    input: &request::ChatInput,
    cancel: Cancel,
) -> Result<Prepared, ApiError> {
    let assistant: &AssistantRow = &caller.assistant;

    // A key acts as its agent in its own organisation; a key that names an agent of another
    // tenant is not a key that opens anything (the row is legacy data).
    let org_id = match (caller.org_id(), assistant.organization_id.as_deref()) {
        (Some(key_org), Some(agent_org)) if key_org == agent_org => Some(agent_org.to_owned()),
        _ => {
            return Err(
                ApiError::new(ErrorCode::Unauthenticated).message("Invalid or expired API key")
            );
        }
    };

    // The capability gate: the knowledge base, MCP, skills, workflows, a chatflow and a
    // built-in tool that needs a service the port does not have are a 409.
    check_capabilities(state, input, Some(assistant)).await?;

    let user_id = caller.synthetic_user_id();
    let builtin_tools = tools::resolve(
        &state.db,
        input,
        Some(assistant),
        org_id.as_deref(),
        &user_id,
    )
    .await?;
    let tool_names: Vec<String> = builtin_tools.iter().map(|t| t.name.clone()).collect();

    let model_id = if assistant.model.is_empty() {
        DEFAULT_MODEL.to_owned()
    } else {
        assistant.model.clone()
    };
    let route = state.llm.route(&model_id).map_err(|e| llm_error(&e))?;
    let context = Context {
        user_id: user_id.clone(),
        organization_id: org_id.clone(),
        assistant_id: Some(assistant.id.clone()),
        model: model_id.clone(),
    };
    state.meter.check(&context.as_context())?;

    let model_config =
        ModelConfig::from_json(assistant.model_config.as_ref().unwrap_or(&Value::Null));
    let now = crate::http::time::iso(chrono::Utc::now().naive_utc());
    let system = prompt::build(
        Some(&assistant_prompt(Some(assistant), input)),
        &prompt::PromptContext {
            // An API key has no profile and no name: it is the agent, not a person.
            profile: None,
            user_name: None,
            model_name: agents_llm::provider::house_model_name(&model_id),
            now: &now,
            platform_context: state.platform_context,
            tool_names: &tool_names,
        },
    );

    let chat_tools = Arc::new(tools::ChatTools {
        db: state.db.clone(),
        user_id,
        organization_id: org_id,
        // The key acts as the agent in its organisation; a grant names a person, not a key, so
        // there is no caller role to re-check one against.
        organization_role: None,
        assistant_id: Some(assistant.id.clone()),
        session_id: None,
        builtins: builtin_tools,
        // Memory belongs to the chat service: the old API offered no memory tool and kept no
        // profile (differences.md row 142).
        memory: None,
        approval_mode: resolve_tool_approval_mode(assistant.guard_rails.as_ref()),
        timing: state.tool_approval,
    });
    let max_steps = resolve_max_steps(
        assistant.model_config.as_ref(),
        !tool_names.is_empty(),
        state.chat_max_steps,
        state.chat_max_steps_cap,
    );

    let request = LlmRequest {
        model: route.model.clone(),
        messages: model_messages(&system, input),
        tools: chat_tools.definitions(),
        tool_choice: ToolChoice::Auto,
        temperature: model_config.temperature,
        top_p: model_config.top_p,
        max_tokens: model_config.max_tokens,
        presence_penalty: model_config.presence_penalty,
        frequency_penalty: model_config.frequency_penalty,
        reasoning_effort: None,
        response_format: None,
        include_usage: true,
        extra_body: None,
    };

    let executor: Arc<dyn ToolExecutor> = chat_tools.clone();
    Ok(Prepared {
        provider: route.provider,
        model_id,
        request,
        tools: chat_tools,
        executor,
        max_steps: usize::try_from(max_steps).unwrap_or(1),
        cancel,
        meter: state.meter.clone(),
        context,
    })
}
