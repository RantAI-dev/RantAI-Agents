//! The bindings of an assistant: tools, skills, MCP servers and workflows.
//!
//! Old: `src/app/api/assistants/[id]/{tools,skills,mcp-servers,workflows}/route.ts` and
//! `src/features/assistants/bindings/service.ts`.
//!
//! Reading the bindings needs the role the old code did not check: a viewer of the organisation
//! could replace an assistant's tools (docs/port/differences.md, row 26). Writing them needs a
//! member, and a built-in needs a platform admin.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use serde::Serialize;
use serde_json::Value;

use agents_core::assistant::access::{self, Action};
use agents_core::assistant::bindings::{merge_hidden_tool_ids, non_empty_string_ids};
use agents_store::assistants::{self, Binding};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::http::ApiError;
use crate::http::json::Body;
use crate::http::time::iso;

use super::bodies::parse_id_list;
use super::{actor, caller, forbidden, load_visible, missing_body, store_error, target};

/// `GET /api/assistants/{id}/tools` — the tools bound to the assistant.
pub(super) async fn list_tools(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<ToolJson>>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    let bindings = assistants::list_tool_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(bindings.into_iter().map(ToolJson::from).collect()))
}

/// `PUT /api/assistants/{id}/tools` — replace the tools bound to the assistant.
///
/// The tools that are hidden from the picker stay bound: a PUT cannot drop them.
pub(super) async fn set_tools(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<Vec<ToolSummaryJson>>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let ids = parse_id_list(&body, "toolIds", 1)?;
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    if !access::can(&actor(&caller), Action::EditBindings, &target(&row)) {
        return Err(forbidden());
    }
    let hidden = assistants::hidden_tool_ids(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    let merged = merge_hidden_tool_ids(&ids, &hidden);
    assistants::replace_bindings(&state.db, &row.id, Binding::Tool, &merged)
        .await
        .map_err(|e| store_error(&e))?;
    let bindings = assistants::list_tool_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        bindings.into_iter().map(ToolSummaryJson::from).collect(),
    ))
}

/// `GET /api/assistants/{id}/skills` — the skills bound to the assistant.
pub(super) async fn list_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<SkillJson>>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    let bindings = assistants::list_skill_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(bindings.into_iter().map(SkillJson::from).collect()))
}

/// `PUT /api/assistants/{id}/skills` — replace the skills bound to the assistant.
pub(super) async fn set_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<Vec<SkillBindingJson>>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let ids = parse_id_list(&body, "skillIds", 0)?;
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    if !access::can(&actor(&caller), Action::EditBindings, &target(&row)) {
        return Err(forbidden());
    }
    let ids = non_empty_string_ids(&ids);
    assistants::replace_bindings(&state.db, &row.id, Binding::Skill, &ids)
        .await
        .map_err(|e| store_error(&e))?;
    let bindings = assistants::list_skill_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        bindings.into_iter().map(SkillBindingJson::from).collect(),
    ))
}

/// `GET /api/assistants/{id}/mcp-servers` — the MCP servers bound to the assistant.
pub(super) async fn list_mcp_servers(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<McpServerJson>>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    let bindings = assistants::list_mcp_server_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        bindings.into_iter().map(McpServerJson::from).collect(),
    ))
}

/// `PUT /api/assistants/{id}/mcp-servers` — replace the MCP servers bound to the assistant.
pub(super) async fn set_mcp_servers(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<Vec<McpServerSummaryJson>>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let ids = parse_id_list(&body, "mcpServerIds", 1)?;
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    if !access::can(&actor(&caller), Action::EditBindings, &target(&row)) {
        return Err(forbidden());
    }
    let ids = non_empty_string_ids(&ids);
    assistants::replace_bindings(&state.db, &row.id, Binding::McpServer, &ids)
        .await
        .map_err(|e| store_error(&e))?;
    let bindings = assistants::list_mcp_server_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        bindings
            .into_iter()
            .map(McpServerSummaryJson::from)
            .collect(),
    ))
}

/// `GET /api/assistants/{id}/workflows` — the workflows bound to the assistant.
pub(super) async fn list_workflows(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<WorkflowJson>>, ApiError> {
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    let bindings = assistants::list_workflow_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(bindings.into_iter().map(WorkflowJson::from).collect()))
}

/// `PUT /api/assistants/{id}/workflows` — replace the workflows bound to the assistant.
pub(super) async fn set_workflows(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<String>,
    body: Option<Body<Value>>,
) -> Result<Json<Vec<WorkflowSummaryJson>>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(missing_body());
    };
    let ids = parse_id_list(&body, "workflowIds", 1)?;
    let caller = caller(&state, &headers, &user).await?;
    let row = load_visible(&state.db, &caller, &id).await?;
    if !access::can(&actor(&caller), Action::EditBindings, &target(&row)) {
        return Err(forbidden());
    }
    let ids = non_empty_string_ids(&ids);
    assistants::replace_bindings(&state.db, &row.id, Binding::Workflow, &ids)
        .await
        .map_err(|e| store_error(&e))?;
    let bindings = assistants::list_workflow_bindings(&state.db, &row.id)
        .await
        .map_err(|e| store_error(&e))?;
    Ok(Json(
        bindings
            .into_iter()
            .map(WorkflowSummaryJson::from)
            .collect(),
    ))
}

/// A tool, as the read returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ToolJson {
    id: String,
    name: String,
    display_name: String,
    description: String,
    category: String,
    icon: Option<String>,
    is_built_in: bool,
    enabled: bool,
    user_selectable: bool,
    /// The binding's own flag: the tool is on for this assistant.
    enabled_for_assistant: bool,
}

impl From<assistants::ToolBinding> for ToolJson {
    fn from(b: assistants::ToolBinding) -> Self {
        Self {
            id: b.id,
            name: b.name,
            display_name: b.display_name,
            description: b.description,
            category: b.category,
            icon: b.icon,
            is_built_in: b.is_built_in,
            enabled: b.enabled,
            user_selectable: b.user_selectable,
            enabled_for_assistant: b.bound_enabled,
        }
    }
}

/// A tool, as the write returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ToolSummaryJson {
    id: String,
    name: String,
    display_name: String,
    description: String,
    category: String,
}

impl From<assistants::ToolBinding> for ToolSummaryJson {
    fn from(b: assistants::ToolBinding) -> Self {
        Self {
            id: b.id,
            name: b.name,
            display_name: b.display_name,
            description: b.description,
            category: b.category,
        }
    }
}

/// A skill, as the read returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillJson {
    id: String,
    display_name: String,
    description: String,
    icon: Option<String>,
    enabled: bool,
}

impl From<assistants::SkillBinding> for SkillJson {
    fn from(b: assistants::SkillBinding) -> Self {
        Self {
            id: b.skill_id,
            display_name: b.display_name,
            description: b.description,
            icon: b.icon,
            enabled: b.enabled,
        }
    }
}

/// A skill binding, as the write returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillBindingJson {
    id: String,
    skill_id: String,
    enabled: bool,
    priority: i32,
}

impl From<assistants::SkillBinding> for SkillBindingJson {
    fn from(b: assistants::SkillBinding) -> Self {
        Self {
            id: b.binding_id,
            skill_id: b.skill_id,
            enabled: b.enabled,
            priority: b.priority,
        }
    }
}

/// An MCP server, as the read returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct McpServerJson {
    id: String,
    name: String,
    description: Option<String>,
    transport: String,
    enabled: bool,
    last_connected_at: Option<String>,
    last_error: Option<String>,
    tool_count: i64,
    /// The binding's own flag: the server is on for this assistant.
    bound_enabled: bool,
}

impl From<assistants::McpServerBinding> for McpServerJson {
    fn from(b: assistants::McpServerBinding) -> Self {
        Self {
            id: b.id,
            name: b.name,
            description: b.description,
            transport: b.transport,
            enabled: b.enabled,
            last_connected_at: b.last_connected_at.map(iso),
            last_error: b.last_error,
            tool_count: b.tool_count,
            bound_enabled: b.bound_enabled,
        }
    }
}

/// An MCP server, as the write returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct McpServerSummaryJson {
    id: String,
    name: String,
    description: Option<String>,
    transport: String,
    enabled: bool,
    tool_count: i64,
}

impl From<assistants::McpServerBinding> for McpServerSummaryJson {
    fn from(b: assistants::McpServerBinding) -> Self {
        Self {
            id: b.id,
            name: b.name,
            description: b.description,
            transport: b.transport,
            enabled: b.enabled,
            tool_count: b.tool_count,
        }
    }
}

/// A workflow, as the read returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkflowJson {
    id: String,
    name: String,
    description: Option<String>,
    status: String,
    mode: String,
    category: String,
    trigger: Value,
    tags: Vec<String>,
    nodes: Value,
    /// How many times the workflow ran. The old shape nested it in `_count`, a key the
    /// conventions do not allow.
    runs_count: i64,
    /// The binding's own flag: the workflow is on for this assistant.
    enabled_for_assistant: bool,
}

impl From<assistants::WorkflowBinding> for WorkflowJson {
    fn from(b: assistants::WorkflowBinding) -> Self {
        Self {
            id: b.id,
            name: b.name,
            description: b.description,
            status: b.status,
            mode: b.mode,
            category: b.category,
            trigger: b.trigger,
            tags: b.tags,
            nodes: b.nodes,
            runs_count: b.runs,
            enabled_for_assistant: b.bound_enabled,
        }
    }
}

/// A workflow, as the write returns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkflowSummaryJson {
    id: String,
    name: String,
    description: Option<String>,
    status: String,
    mode: String,
    category: String,
}

impl From<assistants::WorkflowBinding> for WorkflowSummaryJson {
    fn from(b: assistants::WorkflowBinding) -> Self {
        Self {
            id: b.id,
            name: b.name,
            description: b.description,
            status: b.status,
            mode: b.mode,
            category: b.category,
        }
    }
}
