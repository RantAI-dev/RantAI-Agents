//! The wizard's tools: the catalogues it lists and the proposal it makes.
//!
//! Old: `src/features/assistants/wizard/tools.ts` (`buildWizardTools`) and the
//! `WizardDeps` closures of `src/features/assistants/wizard/service.ts`.
//!
//! The tool the client sees is the same: every call is a `tool-input-available` chunk with
//! the call's arguments, followed by a `tool-output-available` chunk with what the tool
//! returned. For `proposeAgent` the arguments in the first chunk are the sanitised
//! proposal, the way the old code mutated the payload in place before the frame was
//! written.

use serde_json::{Value, json};

use agents_core::assistant::wizard::{KnownIds, ProposeAgentInput, sanitize_proposal};
use agents_llm::types::ToolDefinition;
use agents_store::catalog::{KnowledgeGroupEntry, McpServerEntry, SkillEntry, ToolEntry};

use crate::policy::WizardModelEntry;

/// The tool that proposes the agent.
const PROPOSE: &str = "proposeAgent";
/// The tool that changes the proposal.
const REFINE: &str = "refineAgent";

/// The catalogues the wizard offers.
#[derive(Debug, Clone, Default)]
pub(super) struct Catalogues {
    pub models: Vec<WizardModelEntry>,
    pub tools: Vec<ToolEntry>,
    pub skills: Vec<SkillEntry>,
    pub mcp_servers: Vec<McpServerEntry>,
    pub knowledge_groups: Vec<KnowledgeGroupEntry>,
    /// How many agents the organisation already has. The prompt says the number.
    pub agent_count: i64,
}

impl Catalogues {
    /// The ids that actually exist, the way the old `known` sets were built.
    pub(super) fn known_ids(&self) -> KnownIds {
        KnownIds {
            models: self.models.iter().map(|m| m.id.clone()).collect(),
            tools: self.tools.iter().map(|t| t.id.clone()).collect(),
            skills: self.skills.iter().map(|s| s.id.clone()).collect(),
            mcp: self.mcp_servers.iter().map(|m| m.id.clone()).collect(),
            kbs: self.knowledge_groups.iter().map(|k| k.id.clone()).collect(),
        }
    }
}

/// What one tool call produced.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum ToolRun {
    /// The tool ran: the arguments the client sees, and what the tool returned.
    Ran {
        /// The arguments, as the `tool-input-available` chunk carries them.
        input: Value,
        /// What the tool returned.
        output: Value,
    },
    /// The arguments could not be read: the call is an error and the tool did not run.
    Invalid {
        /// The arguments the model sent, as far as they could be read.
        input: Value,
        /// What to tell the model.
        error: String,
    },
}

/// The tools the wizard offers the model.
pub(super) fn definitions() -> Vec<ToolDefinition> {
    vec![
        empty_tool("listModels", "List AI models available in this org."),
        empty_tool(
            "listTools",
            "List tools available to agents (built-in + custom). Call before suggesting tool IDs.",
        ),
        empty_tool(
            "listSkills",
            "List skills installed in this org. Each skill may require specific tools.",
        ),
        empty_tool("listMcpServers", "List MCP servers connected to this org."),
        empty_tool(
            "listKnowledgeGroups",
            "List knowledge base groups in this org.",
        ),
        ToolDefinition {
            name: PROPOSE.to_owned(),
            description: Some(
                "Emit the final proposed agent draft. Only call after gathering enough info and \
                 listing the relevant catalogs. All IDs must come from list* results."
                    .to_owned(),
            ),
            parameters: proposal_schema(),
        },
        ToolDefinition {
            name: REFINE.to_owned(),
            description: Some(
                "Apply a partial update to the current draft (e.g., after the user says 'use \
                 GPT-4 instead')."
                    .to_owned(),
            ),
            parameters: refine_schema(),
        },
    ]
}

/// A tool that takes no arguments.
fn empty_tool(name: &str, description: &str) -> ToolDefinition {
    ToolDefinition {
        name: name.to_owned(),
        description: Some(description.to_owned()),
        parameters: json!({"type": "object", "properties": {}, "additionalProperties": false}),
    }
}

/// The arguments of `proposeAgent`.
fn proposal_schema() -> Value {
    json!({
        "type": "object",
        "properties": proposal_properties(),
        "required": ["name", "systemPrompt", "model"],
        "additionalProperties": false
    })
}

/// The arguments of `refineAgent`: the same fields, all of them optional.
fn refine_schema() -> Value {
    json!({
        "type": "object",
        "properties": proposal_properties(),
        "additionalProperties": false
    })
}

/// The fields of a proposal.
fn proposal_properties() -> Value {
    json!({
        "name": {"type": "string", "minLength": 1},
        "description": {"type": "string"},
        "emoji": {"type": "string", "default": "🤖"},
        "tags": {"type": "array", "items": {"type": "string"}, "default": []},
        "systemPrompt": {"type": "string", "minLength": 20},
        "model": {"type": "string", "minLength": 1},
        "openingMessage": {"type": "string"},
        "openingQuestions": {"type": "array", "items": {"type": "string"}, "default": []},
        "liveChatEnabled": {"type": "boolean", "default": false},
        "selectedToolIds": {"type": "array", "items": {"type": "string"}, "default": []},
        "selectedSkillIds": {"type": "array", "items": {"type": "string"}, "default": []},
        "selectedMcpServerIds": {"type": "array", "items": {"type": "string"}, "default": []},
        "selectedWorkflowIds": {"type": "array", "items": {"type": "string"}, "default": []},
        "useKnowledgeBase": {"type": "boolean", "default": false},
        "knowledgeBaseGroupIds": {"type": "array", "items": {"type": "string"}, "default": []},
        "uncertainty": {
            "type": "object",
            "additionalProperties": {"type": "string", "enum": ["locked", "ai-suggested", "empty"]},
            "default": {}
        },
        "reasoning": {"type": "string"}
    })
}

/// Run one tool call.
///
/// The proposal is sanitised before it goes to the client: the ids the organisation does
/// not have are dropped, the way `sanitizeProposal` dropped them. The refinement is not:
/// the old code only wired `onProposal`, so a refinement went to the client as the model
/// wrote it.
pub(super) fn run(name: &str, args: &Value, catalogues: &Catalogues) -> ToolRun {
    match name {
        "listModels" => ToolRun::Ran {
            input: json!({}),
            output: models_output(catalogues),
        },
        "listTools" => ToolRun::Ran {
            input: json!({}),
            output: tools_output(catalogues),
        },
        "listSkills" => ToolRun::Ran {
            input: json!({}),
            output: skills_output(catalogues),
        },
        "listMcpServers" => ToolRun::Ran {
            input: json!({}),
            output: mcp_output(catalogues),
        },
        "listKnowledgeGroups" => ToolRun::Ran {
            input: json!({}),
            output: knowledge_output(catalogues),
        },
        PROPOSE => match read_proposal(args) {
            Ok(payload) => {
                let clean = sanitize_proposal(&payload, &catalogues.known_ids());
                ToolRun::Ran {
                    input: serde_json::to_value(&clean.payload).unwrap_or(Value::Null),
                    output: json!({"ok": true}),
                }
            }
            Err(error) => ToolRun::Invalid {
                input: args.clone(),
                error,
            },
        },
        REFINE => ToolRun::Ran {
            input: args.clone(),
            output: json!({"ok": true}),
        },
        _ => ToolRun::Invalid {
            input: args.clone(),
            error: "The wizard has no tool with that name.".to_owned(),
        },
    }
}

/// Read the arguments of `proposeAgent`.
fn read_proposal(args: &Value) -> Result<ProposeAgentInput, String> {
    let payload: ProposeAgentInput =
        serde_json::from_value(args.clone()).map_err(|_| "The proposal could not be read.")?;
    if payload.name.trim().is_empty() {
        return Err("The proposal has no name.".to_owned());
    }
    if payload.system_prompt.chars().count() < 20 {
        return Err("The proposal's system prompt is too short.".to_owned());
    }
    if payload.model.trim().is_empty() {
        return Err("The proposal has no model.".to_owned());
    }
    Ok(payload)
}

/// The models, as the `listModels` tool returns them.
fn models_output(catalogues: &Catalogues) -> Value {
    Value::Array(
        catalogues
            .models
            .iter()
            .map(|model| {
                let mut entry = json!({
                    "id": model.id,
                    "name": model.name,
                    "functionCalling": model.function_calling,
                });
                if let Some(ctx) = model.ctx {
                    entry
                        .as_object_mut()
                        .map(|object| object.insert("ctx".to_owned(), json!(ctx)));
                }
                entry
            })
            .collect(),
    )
}

/// The tools, as the `listTools` tool returns them.
fn tools_output(catalogues: &Catalogues) -> Value {
    Value::Array(
        catalogues
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "id": tool.id,
                    "name": tool.name,
                    "description": tool.description,
                    "category": tool.category,
                })
            })
            .collect(),
    )
}

/// The skills, as the `listSkills` tool returns them.
fn skills_output(catalogues: &Catalogues) -> Value {
    Value::Array(
        catalogues
            .skills
            .iter()
            .map(|skill| {
                json!({
                    "id": skill.id,
                    "name": skill.name,
                    "summary": skill.summary,
                    "requiredToolIds": [],
                })
            })
            .collect(),
    )
}

/// The MCP servers, as the `listMcpServers` tool returns them.
fn mcp_output(catalogues: &Catalogues) -> Value {
    Value::Array(
        catalogues
            .mcp_servers
            .iter()
            .map(|server| {
                json!({
                    "id": server.id,
                    "name": server.name,
                    "toolSummary": server.tool_summary,
                })
            })
            .collect(),
    )
}

/// The knowledge base groups, as the `listKnowledgeGroups` tool returns them.
fn knowledge_output(catalogues: &Catalogues) -> Value {
    Value::Array(
        catalogues
            .knowledge_groups
            .iter()
            .map(|group| {
                json!({
                    "id": group.id,
                    "name": group.name,
                    "parentId": group.parent_id,
                    "docCount": group.doc_count,
                })
            })
            .collect(),
    )
}
