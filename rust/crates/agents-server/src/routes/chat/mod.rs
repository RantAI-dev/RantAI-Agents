//! The plain chat: `POST /api/chat`.
//!
//! Old: `src/app/api/chat/route.ts` and `runChat` in `src/features/chat-public/service.ts`.
//!
//! This is the D2 capability, an assistant with no knowledge base, no chatflow and no
//! attachments, plus D3: the built-in tools that need no outside service, with the approval
//! gate (`tools.rs`, `approval.rs`). The two memory tools (`saveMemory` and `forgetMemory`)
//! belong to the chat service, not to the assistant, so they are here: the profile changes
//! through them and through the summary (docs/port/differences.md, row 3).
//!
//! A request the chat does not cover is answered with a 409 `capability_not_ported`, so
//! the router sends it to the TypeScript service instead.

mod approval;
mod memory;
mod persist;
mod prompt;
mod request;
mod stream;
mod tools;

use std::io;
use std::sync::Arc;

use axum::Router;
use axum::body::{Body as AxumBody, Bytes};
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Response};
use axum::routing::post;
use futures::StreamExt;
use serde_json::Value;
use tokio::sync::mpsc;

use agents_contracts::error_codes::ErrorCode;
use agents_contracts::ui_stream::{
    TOOL_APPROVAL_HEADER, UI_MESSAGE_STREAM_HEADERS, tool_approval_header_value,
};
use agents_core::assistant::config::{MemoryConfig, ModelConfig};
use agents_core::authz::Permission;
use agents_core::chat::step_budget::resolve_max_steps;
use agents_core::prompt::approval::resolve_tool_approval_mode;
use agents_llm::agent_loop::{ToolExecutor, run_agent_loop};
use agents_llm::client::{Cancel, CancelHandle};
use agents_llm::provider::Provider;
use agents_llm::types::{ChatRequest as LlmRequest, Message, ReasoningEffort, ToolChoice};
use agents_store::assistants::AssistantRow;
use agents_store::{PgPool, assistants, sessions};

use crate::AppState;
use crate::auth::{CurrentUser, active_org};
use crate::http::ApiError;
use crate::http::json::Body;
use crate::policy::ChatContext;
use crate::routes::assistants::{Caller, load_authorized};

/// The model a chat without an assistant of its own uses.
const DEFAULT_MODEL: &str = "rantai/nano";

/// How many frames the response waits for before the writer catches up.
const FRAME_BUFFER: usize = 32;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/chat", post(chat))
        .merge(approval::router())
}

/// `POST /api/chat`: the plain chat, as a UI message stream.
async fn chat(
    State(state): State<AppState>,
    user: CurrentUser,
    headers: HeaderMap,
    body: Option<Body<Value>>,
) -> Result<Response<AxumBody>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let input = request::parse(&body, &read_headers(&headers))?;
    let now = now_iso();

    // The assistant the chat is with: one the caller may use (§3.3). Another organisation's
    // assistant is a 404, the same answer as an assistant that does not exist; one of the
    // caller's own organisation that no grant reaches is a 403.
    let caller = chat_caller(&state, &headers, &user).await;
    let assistant = match input.assistant_id() {
        Some(id) => Some(load_authorized(&state.db, &caller, id, Permission::AgentsUse).await?),
        None => None,
    };

    // A capability the chat does not have is a 409, not a wrong answer.
    check_capabilities(&state, &input, assistant.as_ref()).await?;
    let builtin_tools = tools::resolve(
        &state.db,
        &input,
        assistant.as_ref(),
        caller.org_id.as_deref(),
        &user.id,
    )
    .await?;
    let tool_names: Vec<String> = builtin_tools.iter().map(|t| t.name.clone()).collect();

    // The session: one the caller owns, or none. An unknown id is dropped, the way the
    // TypeScript dropped it.
    let session_id = match input.body.session_id.as_deref() {
        Some(id) => sessions::get_session(&state.db, &user.id, id)
            .await
            .ok()
            .map(|session| session.id),
        None => None,
    };

    let memory_config = assistant
        .as_ref()
        .map(|row| MemoryConfig::from_json(row.memory_config.as_ref().unwrap_or(&Value::Null)))
        .unwrap_or_default();
    let model_config = assistant
        .as_ref()
        .map(|row| ModelConfig::from_json(row.model_config.as_ref().unwrap_or(&Value::Null)))
        .unwrap_or_default();
    // The long-term profile is read and written only when the assistant keeps one: the old
    // code passed no profile user to the memory tools and skipped the drain otherwise.
    let profile_enabled = memory_config.enabled && memory_config.long_term_profile;
    let profile = if profile_enabled {
        match memory::load_profile(&state.db, &user.id).await {
            Ok(profile) => profile,
            Err(error) => {
                // Graceful degradation: the chat goes on without the profile.
                tracing::error!(error = %error, "the memory profile could not be read");
                None
            }
        }
    } else {
        None
    };

    let model_id = assistant
        .as_ref()
        .map(|row| row.model.clone())
        .filter(|model| !model.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_owned());
    let route = state
        .llm
        .route(&model_id)
        .map_err(|error| llm_error(&error))?;

    let meter_context = ChatContext {
        user_id: &user.id,
        organization_id: caller.org_id.as_deref(),
        assistant_id: assistant.as_ref().map(|row| row.id.as_str()),
        model: &model_id,
    };
    state.meter.check(&meter_context)?;

    let system = prompt::build(
        Some(&assistant_prompt(assistant.as_ref(), &input)),
        &prompt::PromptContext {
            profile: profile.as_ref(),
            user_name: user_name(&state.db, &user.id).await.as_deref(),
            model_name: agents_llm::provider::house_model_name(&model_id),
            now: &now,
            platform_context: state.platform_context,
            tool_names: &tool_names,
        },
    );

    let chat_tools = Arc::new(tools::ChatTools {
        db: state.db.clone(),
        user_id: user.id.clone(),
        organization_id: caller.org_id.clone(),
        organization_role: caller.role,
        assistant_id: assistant.as_ref().map(|row| row.id.clone()),
        session_id: session_id.clone(),
        builtins: builtin_tools,
        memory: memory_config.enabled.then(|| {
            memory::MemoryTools::new(
                state.db.clone(),
                user.id.clone(),
                now.clone(),
                profile_enabled,
            )
        }),
        approval_mode: resolve_tool_approval_mode(
            assistant.as_ref().and_then(|row| row.guard_rails.as_ref()),
        ),
        timing: state.tool_approval,
    });
    let gated = tool_approval_header_value(&chat_tools.gated());
    let max_steps = resolve_max_steps(
        assistant.as_ref().and_then(|row| row.model_config.as_ref()),
        !tool_names.is_empty(),
        state.chat_max_steps,
        state.chat_max_steps_cap,
    );

    let request = LlmRequest {
        model: route.model.clone(),
        messages: model_messages(&system, &input),
        tools: chat_tools.definitions(),
        tool_choice: ToolChoice::Auto,
        temperature: model_config.temperature,
        top_p: model_config.top_p,
        max_tokens: model_config.max_tokens,
        presence_penalty: model_config.presence_penalty,
        frequency_penalty: model_config.frequency_penalty,
        reasoning_effort: model_config.reasoning_effort.map(map_reasoning_effort),
        response_format: None,
        include_usage: true,
        extra_body: None,
    };

    let executor: Arc<dyn ToolExecutor> = chat_tools.clone();
    let (handle, cancel) = Cancel::channel();
    let run = ChatRun {
        db: state.db.clone(),
        client: state.http.clone(),
        user_id: user.id.clone(),
        organization_id: caller.org_id.clone(),
        assistant_id: assistant.as_ref().map(|row| row.id.clone()),
        model_id: model_id.clone(),
        session_id,
        assistant_message_id: input.body.assistant_message_id.clone(),
        user_row: input
            .body
            .messages
            .iter()
            .rev()
            .find(|message| message.role == "user")
            .map(persist::build_user_row),
        profile_enabled,
        provider: route.provider,
        model: route.model.clone(),
        request,
        executor,
        tools: chat_tools,
        cancel: cancel.clone(),
        handle,
        max_steps: usize::try_from(max_steps).unwrap_or(1),
        meter: state.meter.clone(),
        now,
    };

    let (tx, rx) = mpsc::channel::<Result<Bytes, io::Error>>(FRAME_BUFFER);
    tokio::spawn(async move {
        run.go(tx).await;
    });
    let body = AxumBody::from_stream(futures::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    }));

    let mut response = Response::new(body);
    for (name, value) in UI_MESSAGE_STREAM_HEADERS {
        if let Ok(value) = HeaderValue::from_str(value) {
            response.headers_mut().insert(name, value);
        }
    }
    // The client renders Approve and Deny for the calls of these tools.
    if !gated.is_empty()
        && let Ok(value) = HeaderValue::from_str(&gated)
    {
        response.headers_mut().insert(TOOL_APPROVAL_HEADER, value);
    }
    Ok(response)
}

/// What the assistant brings to the system prompt.
fn assistant_prompt(
    assistant: Option<&AssistantRow>,
    input: &request::ChatInput,
) -> prompt::AssistantPrompt {
    match assistant {
        Some(row) => prompt::AssistantPrompt {
            name: Some(row.name.clone()),
            system_prompt: row.system_prompt.clone(),
            live_chat_enabled: row.live_chat_enabled,
            guard_rails: row.guard_rails.clone(),
            model_config: ModelConfig::from_json(row.model_config.as_ref().unwrap_or(&Value::Null)),
            memory_config: MemoryConfig::from_json(
                row.memory_config.as_ref().unwrap_or(&Value::Null),
            ),
        },
        // No assistant: the prompt the client sent, or the generic one.
        None => prompt::AssistantPrompt {
            name: None,
            system_prompt: input
                .system_prompt()
                .unwrap_or(prompt::BASE_SYSTEM_PROMPT)
                .to_owned(),
            live_chat_enabled: false,
            guard_rails: None,
            model_config: ModelConfig::default(),
            memory_config: MemoryConfig::default(),
        },
    }
}

/// The conversation as the model sees it: the system prompt, then the messages.
fn model_messages(system: &str, input: &request::ChatInput) -> Vec<Message> {
    let mut messages = vec![Message::system(system)];
    for message in &input.body.messages {
        let message = match message.role.as_str() {
            "system" => Message::system(message.content.clone()),
            "assistant" => Message::assistant(message.content.clone()),
            _ => Message::user(message.content.clone()),
        };
        messages.push(message);
    }
    messages
}

/// The reasoning effort of the assistant's model config, in the names the client uses.
fn map_reasoning_effort(
    effort: agents_core::assistant::config::ReasoningEffort,
) -> ReasoningEffort {
    match effort {
        agents_core::assistant::config::ReasoningEffort::Low => ReasoningEffort::Low,
        agents_core::assistant::config::ReasoningEffort::Medium => ReasoningEffort::Medium,
        agents_core::assistant::config::ReasoningEffort::High => ReasoningEffort::High,
    }
}

/// The caller and the organisation the request acts in.
///
/// A caller without an organisation may still chat with a built-in assistant, so a missing
/// organisation is not an error here.
async fn chat_caller(state: &AppState, headers: &HeaderMap, user: &CurrentUser) -> Caller {
    match active_org(state, headers, user).await {
        Ok(org) => Caller {
            user_id: user.id.clone(),
            org_id: Some(org.org_id),
            role: Some(org.role),
            is_platform_admin: user.is_platform_admin,
        },
        Err(_) => Caller {
            user_id: user.id.clone(),
            org_id: None,
            role: None,
            is_platform_admin: user.is_platform_admin,
        },
    }
}

/// The headers the old route read.
fn read_headers(headers: &HeaderMap) -> request::ChatHeaders {
    request::ChatHeaders {
        assistant_id: header(headers, "x-assistant-id"),
        system_prompt: header(headers, "x-system-prompt").and_then(|value| decode_base64(&value)),
        use_knowledge_base: header(headers, "x-use-knowledge-base").and_then(|value| {
            match value.trim() {
                "true" => Some(true),
                "false" => Some(false),
                _ => None,
            }
        }),
    }
}

/// One header, as a string.
fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// The base64 system prompt of a client that has no assistant of its own.
///
/// A value that is not base64 is ignored, the way the TypeScript ignored it.
fn decode_base64(value: &str) -> Option<String> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

/// The name of the user, for the `{{user_name}}` placeholder.
async fn user_name(db: &PgPool, user_id: &str) -> Option<String> {
    match agents_store::users::status(db, user_id).await {
        Ok(Some(status)) => status.name.filter(|name| !name.is_empty()),
        Ok(None) => None,
        Err(error) => {
            tracing::error!(error = %error, "the user could not be read");
            None
        }
    }
}

/// The answer to a request the plain chat does not cover.
fn not_ported() -> ApiError {
    ApiError::new(ErrorCode::CapabilityNotPorted)
}

/// The capabilities the chat does not have.
///
/// The knowledge base, the assistant's MCP servers, its workflows and its chatflow, its skills
/// and the attachments of the request all belong to a later slice of the port (D3, D4). The
/// request is answered with a 409 so the router sends it to the TypeScript service. The
/// assistant's tools are decided by `tools::resolve`.
///
/// The assistant's own bindings decide, not the request's switches: a chat is never answered
/// with less than the assistant was set up for. The knowledge base is the exception the old
/// code made: the request may turn it off.
async fn check_capabilities(
    state: &AppState,
    input: &request::ChatInput,
    assistant: Option<&AssistantRow>,
) -> Result<(), ApiError> {
    let body = &input.body;

    // The request's own switches: it asks for something the plain chat does not have.
    if body
        .knowledge_base_group_ids
        .iter()
        .any(|id| id != "__all__")
    {
        return Err(not_ported());
    }
    if !body.enabled_skill_ids.is_empty()
        || body.enable_web_search == Some(true)
        || body.enable_code_interpreter == Some(true)
        || body.canvas_mode.is_some()
    {
        return Err(not_ported());
    }
    if body.file_context.is_some() || !body.file_document_ids.is_empty() {
        return Err(not_ported());
    }
    if input.use_knowledge_base() == Some(true) {
        return Err(not_ported());
    }
    if input.unported_parts {
        return Err(not_ported());
    }

    let Some(assistant) = assistant else {
        // Without an assistant there is no knowledge base and no tool either.
        return Ok(());
    };

    // The knowledge base: the request may turn it off, the assistant's own flag is the
    // fallback.
    if input
        .use_knowledge_base()
        .unwrap_or(assistant.use_knowledge_base)
    {
        return Err(not_ported());
    }
    if !assistant.knowledge_base_group_ids.is_empty() {
        return Err(not_ported());
    }

    let servers = assistants::list_mcp_server_bindings(&state.db, &assistant.id)
        .await
        .map_err(|e| store_error(&e))?;
    if servers
        .iter()
        .any(|server| server.bound_enabled && server.enabled)
    {
        return Err(not_ported());
    }

    // The skills of the assistant.
    let skills = assistants::list_skill_bindings(&state.db, &assistant.id)
        .await
        .map_err(|e| store_error(&e))?;
    if !skills.is_empty() {
        return Err(not_ported());
    }

    // The workflows, and the chatflow that runs instead of the chat.
    let workflows = assistants::list_workflow_bindings(&state.db, &assistant.id)
        .await
        .map_err(|e| store_error(&e))?;
    if workflows.iter().any(|workflow| workflow.bound_enabled) {
        return Err(not_ported());
    }
    if assistants::has_active_chatflow(&state.db, &assistant.id)
        .await
        .map_err(|e| store_error(&e))?
    {
        return Err(not_ported());
    }

    Ok(())
}

/// The body a request needs and did not send.
fn missing_body() -> ApiError {
    ApiError::from(vec![agents_core::validation::FieldError::new(
        "",
        "required",
        "A JSON body is required.",
    )])
}

/// The store's failure, as the answer the caller sees.
fn store_error(e: &agents_store::StoreError) -> ApiError {
    match e {
        agents_store::StoreError::NotFound => ApiError::new(ErrorCode::NotFound),
        agents_store::StoreError::Conflict => ApiError::new(ErrorCode::Conflict),
        agents_store::StoreError::Db(err) => {
            tracing::error!(error = %err, "the chat store failed");
            ApiError::new(ErrorCode::Internal)
        }
    }
}

/// The failure of the provider, as the answer the caller sees.
fn llm_error(error: &agents_llm::types::LlmError) -> ApiError {
    match error {
        agents_llm::types::LlmError::MissingApiKey { .. } => {
            tracing::error!(error = %error, "the model provider has no key");
            ApiError::new(ErrorCode::Internal)
        }
        other => {
            tracing::warn!(error = %other, "the model provider refused the chat");
            ApiError::new(other.code())
        }
    }
}

/// The current instant, as the prompt and the rows use it.
fn now_iso() -> String {
    crate::http::time::iso(chrono::Utc::now().naive_utc())
}

/// One chat: the model call, the frames and the work that follows them.
struct ChatRun {
    db: PgPool,
    client: reqwest::Client,
    user_id: String,
    organization_id: Option<String>,
    assistant_id: Option<String>,
    model_id: String,
    /// The name the provider knows the model by.
    model: String,
    session_id: Option<String>,
    assistant_message_id: Option<String>,
    user_row: Option<persist::UserRow>,
    /// Whether the assistant keeps a long-term profile: the drain counts the turn only then.
    profile_enabled: bool,
    provider: Provider,
    request: LlmRequest,
    executor: Arc<dyn ToolExecutor>,
    /// The same tools, for the frames of a call the SDK would have refused.
    tools: Arc<tools::ChatTools>,
    cancel: Cancel,
    handle: CancelHandle,
    max_steps: usize,
    meter: Arc<dyn crate::policy::ChatMeter>,
    now: String,
}

impl ChatRun {
    /// The chat: the frames, and then the work that follows them.
    async fn go(self, tx: mpsc::Sender<Result<Bytes, io::Error>>) {
        let mut frames = stream::Frames::with_tools(self.tools.clone());
        send_all(&tx, &stream::Frames::start()).await;

        let mut events = Box::pin(run_agent_loop(
            &self.client,
            &self.provider,
            self.request.clone(),
            self.executor.as_ref(),
            self.max_steps,
            self.cancel.clone(),
        ));
        loop {
            let event = tokio::select! {
                // The client went away: stop the model call.
                () = tx.closed() => {
                    self.handle.cancel();
                    return;
                }
                event = events.next() => event,
            };
            let Some(event) = event else { break };
            match event {
                Ok(event) => {
                    let out = frames.on_event(event);
                    send_all(&tx, &out).await;
                }
                Err(error) => {
                    let message = stream::error_message(&error);
                    let out = frames.on_error(&message);
                    send_all(&tx, &out).await;
                    break;
                }
            }
        }

        // The answer is on the wire: the rows and the profile follow.
        self.after(&frames).await;
        send_all(&tx, &frames.close()).await;
    }

    /// The work that follows the answer: the profile, the rows and the usage.
    async fn after(&self, frames: &stream::Frames) {
        // A stream that failed has no answer: the turn is not counted and nothing is written
        // (the TypeScript skipped the same work, because `result.text` rejected).
        if self.profile_enabled && !frames.failed() {
            match memory::drain(&self.db, &self.user_id, &self.now).await {
                Ok(profile) => {
                    if agents_core::memory::profile::summary_needs_refresh(&profile) {
                        self.spawn_summary(profile);
                    }
                }
                Err(error) => {
                    tracing::error!(error = %error, "the memory profile could not be written");
                }
            }
        }

        if let (Some(session_id), Some(assistant_message_id)) =
            (&self.session_id, &self.assistant_message_id)
        {
            if !frames.text.is_empty() {
                if let Err(error) = persist::persist(
                    &self.db,
                    &self.user_id,
                    session_id,
                    assistant_message_id,
                    self.user_row.as_ref(),
                    &frames.text,
                    &frames.reasoning,
                )
                .await
                {
                    // The session may have been deleted while the answer streamed; the
                    // dashboard writes the rows itself, so this is not worth an error page.
                    tracing::warn!(error = %error, "the answer could not be written");
                }
            }
        }

        self.meter.record(
            &ChatContext {
                user_id: &self.user_id,
                organization_id: self.organization_id.as_deref(),
                assistant_id: self.assistant_id.as_deref(),
                model: &self.model_id,
            },
            frames.usage,
        );
    }

    /// Writes the "quick context" summary of the profile.
    ///
    /// The summary is written by the model, so it runs in its own task: it must never hold
    /// the answer back.
    fn spawn_summary(&self, profile: agents_core::memory::types::UserProfile) {
        let db = self.db.clone();
        let client = self.client.clone();
        let provider = self.provider.clone();
        let model = self.model.clone();
        let user_id = self.user_id.clone();
        tokio::spawn(async move {
            let summary = generate_summary(&client, &provider, &model, &profile).await;
            let fingerprint = agents_core::memory::profile::profile_content_fingerprint(&profile);
            if let Err(error) = memory::write_summary(&db, &user_id, &fingerprint, &summary).await {
                tracing::warn!(error = %error, "the memory summary could not be written");
            }
        });
    }
}
/// The summary of a profile, as the model writes it.
async fn generate_summary(
    client: &reqwest::Client,
    provider: &Provider,
    model: &str,
    profile: &agents_core::memory::types::UserProfile,
) -> String {
    let facts = profile
        .facts
        .iter()
        .map(|fact| format!("{}: {}", fact.predicate, fact.object))
        .collect::<Vec<String>>()
        .join(", ");
    let preferences = profile
        .preferences
        .iter()
        .map(|preference| format!("{}: {}", preference.key, preference.value))
        .collect::<Vec<String>>()
        .join(", ");
    let prompt = format!(
        "Summarize this user in 2-3 concise sentences based on their profile:\nFacts: {}\nPreferences: {}\nTotal conversations: {}\n\nProvide a brief, natural-sounding summary that captures the key aspects of this user.",
        if facts.is_empty() { "None" } else { &facts },
        if preferences.is_empty() {
            "None"
        } else {
            &preferences
        },
        profile.total_conversations
    );
    let fallback = format!(
        "User with {} known facts and {} preferences.",
        profile.facts.len(),
        profile.preferences.len()
    );
    let request = LlmRequest {
        model: model.to_owned(),
        messages: vec![Message::user(prompt)],
        include_usage: false,
        ..LlmRequest::default()
    };
    let mut events = Box::pin(agents_llm::client::stream_chat(
        client,
        provider,
        &request,
        Cancel::never(),
    ));
    let mut summary = String::new();
    while let Some(event) = events.next().await {
        match event {
            Ok(agents_llm::types::Event::TextDelta { text }) => summary.push_str(&text),
            Ok(_) => {}
            Err(error) => {
                tracing::warn!(error = %error, "the memory summary could not be generated");
                return fallback;
            }
        }
    }
    let summary = summary.trim().to_owned();
    if summary.is_empty() {
        fallback
    } else {
        summary
    }
}

/// Sends the frames, ignoring a client that went away.
async fn send_all(tx: &mpsc::Sender<Result<Bytes, io::Error>>, frames: &[Bytes]) {
    for frame in frames {
        if tx.send(Ok(frame.clone())).await.is_err() {
            return;
        }
    }
}
