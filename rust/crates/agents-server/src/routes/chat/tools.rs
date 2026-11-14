//! The tools of a chat (D3): which ones the model is offered, and running them.
//!
//! Old: `resolveToolsForAssistant`, `resolveToolsByNames` and the built-in branch of
//! `src/lib/tools/registry.ts`, the tool switches of `runChat`
//! (`src/features/chat-public/service.ts`), and `gateToolsForApproval`.
//!
//! The Rust chat runs the built-in tools that need no outside service
//! (`agents_core::tools::PORTED_BUILTIN_TOOLS`) and the two memory tools. Any other tool the
//! chat would offer (a built-in that needs a service, a custom, OpenAPI, MCP or community
//! tool) makes the chat a 409 `capability_not_ported`, so the router sends it to the
//! TypeScript service.

use std::future::Future;
use std::pin::Pin;
use std::time::Instant;

use serde_json::Value;
use sqlx::PgPool;

use agents_contracts::error_codes::ErrorCode;
use agents_core::assistant::config::ToolApproval;
use agents_core::memory::tools::{
    FORGET_MEMORY_TOOL_NAME, ForgetMemoryInput, SAVE_MEMORY_TOOL_NAME, SaveMemoryInput,
};
use agents_core::prompt::approval::tool_needs_approval;
use agents_core::tools::{self as builtin, BUILTIN_TOOL_NAMES};
use agents_llm::agent_loop::{ToolExecutor, ToolOutcome};
use agents_llm::types::{ToolCall, ToolDefinition};
use agents_store::assistants::{self, AssistantRow};
use agents_store::tools::{self as tool_store, ToolExecution};

use super::approval::{self, Outcome};
use super::memory::{self, MemoryTools};
use super::request::ChatInput;
use crate::config::ToolApprovalTiming;
use crate::http::ApiError;

/// A built-in tool the chat offers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundTool {
    /// The id of the `Tool` row, for the execution log.
    pub id: String,
    pub name: String,
    /// The description the model reads: the row's, as the old registry sent it.
    pub description: String,
}

/// A tool the chat would offer, before the switches of the request are applied.
struct Candidate {
    tool: BoundTool,
    ported: bool,
}

fn not_ported() -> ApiError {
    ApiError::new(ErrorCode::CapabilityNotPorted)
}

fn store_error(error: &agents_store::StoreError) -> ApiError {
    tracing::error!(error = %error, "the chat could not read its tools");
    ApiError::new(ErrorCode::Internal)
}

/// Adds a tool row to the candidates. A tool that is not a built-in is not ported: the chat is
/// a 409. A built-in the old registry did not know is skipped, as it was.
fn add_candidate(
    candidates: &mut Vec<Candidate>,
    id: &str,
    name: &str,
    description: &str,
    category: &str,
) -> Result<(), ApiError> {
    if category != "builtin" {
        return Err(not_ported());
    }
    if !BUILTIN_TOOL_NAMES.contains(&name) || candidates.iter().any(|c| c.tool.name == name) {
        return Ok(());
    }
    candidates.push(Candidate {
        tool: BoundTool {
            id: id.to_owned(),
            name: name.to_owned(),
            description: description.to_owned(),
        },
        ported: builtin::is_ported(name),
    });
    Ok(())
}

/// The assistant's tools after the request's switches, in the order the old code offered
/// them: the assistant's bindings, then the tools the request names that are not bound.
///
/// # Errors
/// A 409 when a tool that would be offered is not ported.
pub async fn resolve(
    db: &PgPool,
    input: &ChatInput,
    assistant: Option<&AssistantRow>,
    organization_id: Option<&str>,
    user_id: &str,
) -> Result<Vec<BoundTool>, ApiError> {
    let body = &input.body;
    let mut candidates = Vec::new();
    if let Some(assistant) = assistant {
        let bindings = assistants::list_tool_bindings(db, &assistant.id)
            .await
            .map_err(|e| store_error(&e))?;
        for binding in bindings.iter().filter(|b| b.bound_enabled && b.enabled) {
            add_candidate(
                &mut candidates,
                &binding.id,
                &binding.name,
                &binding.description,
                &binding.category,
            )?;
        }
    }

    if body.enable_tools == Some(false) {
        // The toolbar turned the tools off (skills, which could force them back on, are not
        // ported, so the chat never gets here with one).
        candidates.clear();
    } else if !body.enabled_tool_names.is_empty() {
        let missing: Vec<String> = body
            .enabled_tool_names
            .iter()
            .filter(|name| !candidates.iter().any(|c| &c.tool.name == *name))
            .cloned()
            .collect();
        if !missing.is_empty() {
            let rows = tool_store::find_by_names(db, &missing, organization_id, user_id)
                .await
                .map_err(|e| store_error(&e))?;
            for row in &rows {
                add_candidate(
                    &mut candidates,
                    &row.id,
                    &row.name,
                    &row.description,
                    &row.category,
                )?;
            }
        }
        candidates.retain(|c| body.enabled_tool_names.contains(&c.tool.name));
    }
    if body.enable_web_search == Some(false) {
        candidates.retain(|c| c.tool.name != "web_search");
    }
    if body.enable_code_interpreter == Some(false) {
        candidates.retain(|c| c.tool.name != "code_interpreter");
    }

    if candidates.iter().any(|c| !c.ported) {
        return Err(not_ported());
    }
    Ok(candidates.into_iter().map(|c| c.tool).collect())
}

/// What the stream needs to know about the tools to write the frames the SDK wrote.
pub trait ToolCheck: Send + Sync {
    /// Whether the model was offered a tool of this name.
    fn is_known(&self, name: &str) -> bool;
    /// Whether the input fits the tool; otherwise the message the model gets back.
    fn check(&self, name: &str, args: &Value) -> Result<(), String>;
}

/// The tools of one chat: the built-ins, the memory tools, and the approval gate.
pub struct ChatTools {
    pub db: PgPool,
    pub user_id: String,
    pub organization_id: Option<String>,
    pub assistant_id: Option<String>,
    pub session_id: Option<String>,
    pub builtins: Vec<BoundTool>,
    /// The memory tools, when the assistant's memory is on.
    pub memory: Option<MemoryTools>,
    pub approval_mode: ToolApproval,
    pub timing: ToolApprovalTiming,
}

impl ChatTools {
    /// Every tool name the model is offered, built-ins first.
    fn names(&self) -> Vec<&str> {
        let mut names: Vec<&str> = self.builtins.iter().map(|t| t.name.as_str()).collect();
        if self.memory.is_some() {
            names.push(SAVE_MEMORY_TOOL_NAME);
            names.push(FORGET_MEMORY_TOOL_NAME);
        }
        names
    }

    /// The tools as the model is told about them.
    #[must_use]
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        let mut definitions: Vec<ToolDefinition> = self
            .builtins
            .iter()
            .map(|tool| ToolDefinition {
                name: tool.name.clone(),
                description: Some(tool.description.clone()),
                parameters: builtin::input_schema(&tool.name).unwrap_or(Value::Null),
            })
            .collect();
        if self.memory.is_some() {
            definitions.extend(memory::definitions());
        }
        definitions
    }

    /// The tools that wait for the user's approval, for the `X-Tool-Approval` header.
    #[must_use]
    pub fn gated(&self) -> Vec<&str> {
        self.names()
            .into_iter()
            .filter(|name| tool_needs_approval(name, self.approval_mode))
            .collect()
    }

    /// Runs a built-in tool and writes the execution log.
    async fn run_builtin(
        &self,
        call: &ToolCall,
        input: serde_json::Map<String, Value>,
    ) -> ToolOutcome {
        let started = Instant::now();
        let now_ms = chrono::Utc::now().timestamp_millis();
        let Some(output) = builtin::execute(&call.name, &input, now_ms) else {
            return ToolOutcome::Failed {
                message: format!("There is no tool called {}.", call.name),
            };
        };
        let tool_id = self
            .builtins
            .iter()
            .find(|tool| tool.name == call.name)
            .map(|tool| tool.id.as_str());
        let input = Value::Object(input);
        let run = ToolExecution {
            tool_name: &call.name,
            tool_id,
            assistant_id: self.assistant_id.as_deref(),
            session_id: self.session_id.as_deref(),
            organization_id: self.organization_id.as_deref(),
            user_id: &self.user_id,
            input: &input,
            output: Some(&output),
            error: None,
            duration_ms: i32::try_from(started.elapsed().as_millis()).unwrap_or(i32::MAX),
        };
        if let Err(error) = tool_store::log_execution(&self.db, &run).await {
            // The log is best effort, as `logToolExecution(...).catch(() => {})` was.
            tracing::warn!(error = %error, "the tool execution could not be logged");
        }
        ToolOutcome::Completed {
            content: output.to_string(),
        }
    }
}

impl ToolCheck for ChatTools {
    fn is_known(&self, name: &str) -> bool {
        self.names().contains(&name)
    }

    fn check(&self, name: &str, args: &Value) -> Result<(), String> {
        if !self.is_known(name) {
            // The words of the SDK's `NoSuchToolError`.
            return Err(format!(
                "Model tried to call unavailable tool '{name}'. Available tools: {}.",
                self.names().join(", ")
            ));
        }
        let invalid = |error: serde_json::Error| format!("Invalid input for tool {name}: {error}");
        match name {
            SAVE_MEMORY_TOOL_NAME => serde_json::from_value::<SaveMemoryInput>(args.clone())
                .map(|_| ())
                .map_err(invalid),
            FORGET_MEMORY_TOOL_NAME => serde_json::from_value::<ForgetMemoryInput>(args.clone())
                .map(|_| ())
                .map_err(invalid),
            _ => builtin::validate(name, args).map(|_| ()),
        }
    }
}

impl ToolExecutor for ChatTools {
    fn execute<'a>(
        &'a self,
        call: &'a ToolCall,
    ) -> Pin<Box<dyn Future<Output = ToolOutcome> + Send + 'a>> {
        Box::pin(async move {
            // The input is checked before the gate: the SDK never ran a call it could not
            // parse, so the user is never asked about one.
            if let Err(message) = self.check(&call.name, &call.args) {
                return ToolOutcome::Failed { message };
            }
            if tool_needs_approval(&call.name, self.approval_mode) {
                match approval::wait(&self.db, &call.id, &self.user_id, self.timing).await {
                    Ok(Outcome::Approved) => {}
                    Ok(outcome) => {
                        return ToolOutcome::Completed {
                            content: approval::refusal(outcome).to_string(),
                        };
                    }
                    Err(error) => {
                        tracing::error!(error = %error, "the tool approval could not be written");
                        return ToolOutcome::Failed {
                            message: "The approval could not be recorded, so the action was not performed.".to_owned(),
                        };
                    }
                }
            }
            if let Some(memory) = &self.memory
                && (call.name == SAVE_MEMORY_TOOL_NAME || call.name == FORGET_MEMORY_TOOL_NAME)
            {
                return memory.execute(call).await;
            }
            match builtin::validate(&call.name, &call.args) {
                Ok(input) => self.run_builtin(call, input).await,
                Err(message) => ToolOutcome::Failed { message },
            }
        })
    }
}
