//! The agent-builder wizard's pure parts.
//!
//! Ported from `src/features/assistants/wizard/{tools,service}.ts`: `filterKnownIds`,
//! `buildWizardSystemPrompt` and `sanitizeProposal`. The wizard's model and plan logic
//! (which models a free-plan org may use, the house-model gating) belongs to the caller;
//! the prompt builder only takes the resulting facts as its context (differences row 29).

use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

/// What the wizard knows about the org it builds an agent for.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WizardContext {
    pub organization_id: String,
    pub user_role: String,
    pub existing_agent_count: u32,
    pub tool_count: u32,
    pub skill_count: u32,
    pub mcp_count: u32,
    pub kb_count: u32,
    pub model_count: u32,
    /// A free-plan org may only use free models, so the prompt says to default to Nano.
    pub is_free_plan: bool,
}

/// The wizard's system prompt, byte for byte as the old builder produced it.
#[must_use]
pub fn build_wizard_system_prompt(ctx: &WizardContext) -> String {
    let model_rule = if ctx.is_free_plan {
        "5. This is a FREE-plan org. Default the agent's model to \"rantai/nano\" — the free-plan house model. Only \"rantai/nano\" and free models are available (see listModels); NEVER propose a paid model (e.g. \"rantai/swift\", \"rantai/prime\", or other paid models) — they require a plan upgrade and the agent would fail to save."
    } else {
        "5. Default the agent's model to a RantAI house model from listModels: prefer \"rantai/swift\" for general/economical agents, or \"rantai/prime\" when the agent needs image understanding or long context. Only pick a different model if the user explicitly asks for one. (All RantAI models support function calling.)"
    };
    format!(
        concat!(
            "You are the Agent Builder Wizard for organization {}. You help the user design a new AI agent by asking targeted questions and proposing a complete draft.\n\n",
            "Org context:\n",
            "- User role: {}\n",
            "- {} existing agents\n",
            "- {} tools available, {} skills, {} MCP servers, {} knowledge bases, {} models\n\n",
            "Rules:\n",
            "1. Ask ONE question per turn. Keep it short.\n",
            "2. Before suggesting any tool/skill/MCP/KB/model IDs, call the relevant list* tool to see what actually exists. Never invent IDs.\n",
            "3. Ask 2-4 follow-up questions after the user's first description (audience, data access, actions, personality/guardrails). Then call proposeAgent.\n",
            "4. If the user corrects something mid-conversation, call refineAgent with a partial patch.\n",
            "{}\n",
            "6. System prompt must be at least 20 characters. Use the structure: ## Goal / ## Skills / ## Workflow / ## Constraints.\n",
            "7. Stop after proposeAgent succeeds unless the user asks for changes.\n",
            "8. When emitting the `uncertainty` field in proposeAgent / refineAgent:\n",
            "   - For scalar fields, use the field name as the key (e.g., \"name\", \"model\", \"systemPrompt\", \"openingMessage\", \"emoji\", \"description\").\n",
            "   - For collection items, key = \"<type>:<id>\" — examples: \"tool:tool_abc123\", \"skill:skl_def456\", \"mcp:mcp_789\", \"kb:kbg_012\".\n",
            "   - Mark every field/item you propose with value \"ai-suggested\". Omit any keys for fields you did not set.",
        ),
        ctx.organization_id,
        ctx.user_role,
        ctx.existing_agent_count,
        ctx.tool_count,
        ctx.skill_count,
        ctx.mcp_count,
        ctx.kb_count,
        ctx.model_count,
        model_rule,
    )
}

/// What the wizard's tools returned: the ids that actually exist in the org.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct KnownIds {
    pub models: HashSet<String>,
    pub tools: HashSet<String>,
    pub skills: HashSet<String>,
    pub mcp: HashSet<String>,
    pub kbs: HashSet<String>,
}

/// The ids that are known and the ones that are not, in the order they arrived.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FilterResult {
    pub kept: Vec<String>,
    pub dropped: Vec<String>,
}

/// Splits a proposed id list into known and unknown ids, keeping the order.
///
/// The old code did not deduplicate here: a repeated known id is kept twice.
#[must_use]
pub fn filter_known_ids(ids: &[String], known: &HashSet<String>) -> FilterResult {
    let mut kept = Vec::new();
    let mut dropped = Vec::new();
    for id in ids {
        if known.contains(id) {
            kept.push(id.clone());
        } else {
            dropped.push(id.clone());
        }
    }
    FilterResult { kept, dropped }
}

/// How sure the model is about a field it proposed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UncertaintyValue {
    Locked,
    AiSuggested,
    Empty,
}

/// The payload the wizard's `proposeAgent` tool emits.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposeAgentInput {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_emoji")]
    pub emoji: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub system_prompt: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opening_message: Option<String>,
    #[serde(default)]
    pub opening_questions: Vec<String>,
    #[serde(default)]
    pub live_chat_enabled: bool,
    #[serde(default)]
    pub selected_tool_ids: Vec<String>,
    #[serde(default)]
    pub selected_skill_ids: Vec<String>,
    #[serde(default)]
    pub selected_mcp_server_ids: Vec<String>,
    #[serde(default)]
    pub selected_workflow_ids: Vec<String>,
    #[serde(default)]
    pub use_knowledge_base: bool,
    #[serde(default)]
    pub knowledge_base_group_ids: Vec<String>,
    #[serde(default)]
    pub uncertainty: BTreeMap<String, UncertaintyValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
}

fn default_emoji() -> String {
    "🤖".to_owned()
}

/// What `sanitizeProposal` dropped, per catalog.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedIds {
    pub model: Vec<String>,
    pub tools: Vec<String>,
    pub skills: Vec<String>,
    pub mcp: Vec<String>,
    pub kbs: Vec<String>,
}

/// A proposal with every unknown id removed, and what was removed.
///
/// The workflow ids are not filtered: the old code never checked them against a catalog.
#[must_use]
pub fn sanitize_proposal(payload: &ProposeAgentInput, known: &KnownIds) -> SanitizedProposal {
    let tools = filter_known_ids(&payload.selected_tool_ids, &known.tools);
    let skills = filter_known_ids(&payload.selected_skill_ids, &known.skills);
    let mcp = filter_known_ids(&payload.selected_mcp_server_ids, &known.mcp);
    let kbs = filter_known_ids(&payload.knowledge_base_group_ids, &known.kbs);
    let model_ok = known.models.contains(&payload.model);

    SanitizedProposal {
        payload: ProposeAgentInput {
            model: if model_ok {
                payload.model.clone()
            } else {
                String::new()
            },
            selected_tool_ids: tools.kept,
            selected_skill_ids: skills.kept,
            selected_mcp_server_ids: mcp.kept,
            knowledge_base_group_ids: kbs.kept,
            ..payload.clone()
        },
        dropped: DroppedIds {
            model: if model_ok {
                Vec::new()
            } else {
                vec![payload.model.clone()]
            },
            tools: tools.dropped,
            skills: skills.dropped,
            mcp: mcp.dropped,
            kbs: kbs.dropped,
        },
    }
}

/// The result of [`sanitize_proposal`].
#[derive(Debug, Clone, PartialEq)]
pub struct SanitizedProposal {
    pub payload: ProposeAgentInput,
    pub dropped: DroppedIds,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    fn ctx(is_free_plan: bool) -> WizardContext {
        WizardContext {
            organization_id: "org_1".to_owned(),
            user_role: "admin".to_owned(),
            existing_agent_count: 3,
            tool_count: 10,
            skill_count: 5,
            mcp_count: 2,
            kb_count: 1,
            model_count: 4,
            is_free_plan,
        }
    }

    #[test]
    fn prompt_contains_the_org_context_and_the_model_rule() {
        let paid = build_wizard_system_prompt(&ctx(false));
        assert!(paid.contains("org_1"));
        assert!(paid.contains("3 existing agents"));
        assert!(paid.contains("Never invent IDs"));
        assert!(paid.contains("rantai/swift"));

        let free = build_wizard_system_prompt(&ctx(true));
        assert!(free.contains("FREE-plan"));
        assert!(free.contains("rantai/nano"));
    }

    #[test]
    fn a_proposal_loses_every_unknown_id() -> Result<(), Box<dyn Error>> {
        let payload: ProposeAgentInput = serde_json::from_str(
            r#"{
              "name": "A",
              "emoji": "🤖",
              "tags": [],
              "systemPrompt": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              "model": "openai/gpt-5.2",
              "openingQuestions": [],
              "liveChatEnabled": false,
              "selectedToolIds": ["t1", "tX"],
              "selectedSkillIds": ["s1"],
              "selectedMcpServerIds": [],
              "selectedWorkflowIds": [],
              "useKnowledgeBase": false,
              "knowledgeBaseGroupIds": ["kb1", "kbX"],
              "uncertainty": {}
            }"#,
        )?;
        let known = KnownIds {
            models: HashSet::from(["openai/gpt-5.2".to_owned()]),
            tools: HashSet::from(["t1".to_owned()]),
            skills: HashSet::from(["s1".to_owned()]),
            mcp: HashSet::new(),
            kbs: HashSet::from(["kb1".to_owned()]),
        };
        let result = sanitize_proposal(&payload, &known);
        assert_eq!(result.payload.model, "openai/gpt-5.2");
        assert_eq!(result.payload.selected_tool_ids, vec!["t1".to_owned()]);
        assert_eq!(
            result.payload.knowledge_base_group_ids,
            vec!["kb1".to_owned()]
        );
        assert_eq!(result.dropped.tools, vec!["tX".to_owned()]);
        assert_eq!(result.dropped.kbs, vec!["kbX".to_owned()]);
        assert!(result.dropped.model.is_empty());
        Ok(())
    }

    #[test]
    fn an_unknown_model_is_cleared() -> Result<(), Box<dyn Error>> {
        let payload: ProposeAgentInput = serde_json::from_str(
            r#"{
              "name": "A",
              "systemPrompt": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              "model": "openai/gpt-5.2"
            }"#,
        )?;
        let result = sanitize_proposal(&payload, &KnownIds::default());
        assert_eq!(result.payload.model, "");
        assert_eq!(result.dropped.model, vec!["openai/gpt-5.2".to_owned()]);
        Ok(())
    }
}
