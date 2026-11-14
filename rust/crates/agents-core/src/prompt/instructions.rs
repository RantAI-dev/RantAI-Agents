//! The tool usage and live-chat handoff instructions.
//!
//! Ported from `src/lib/prompts/instructions.ts`. The artifact prompt tables (per-type
//! rules, examples, design tokens) are not part of this port: [`build_tool_instruction`]
//! takes them from its caller as an [`ArtifactContext`], the way the chat layers pass
//! `CANVAS_TYPE_LABELS` and `assembleArtifactContext` today (differences row 30).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The live-chat handoff instruction, appended when `assistant.liveChatEnabled`.
pub const LIVE_CHAT_HANDOFF_INSTRUCTION: &str = "\n\nLIVE CHAT HANDOFF: You have the ability to transfer the conversation to a human agent. When the user explicitly asks to speak with a human, a real person, an agent, or customer support — OR when you cannot help them further and a human would be more appropriate — include the exact marker [AGENT_HANDOFF] at the end of your response. Only use this marker when handoff is genuinely needed. Do NOT use it for normal questions you can answer yourself.";

const DESIGN_QUALITY_REMINDER: &str = "All visual artifacts must be production-quality. Follow the type-specific design rules above. NEVER output plain, unstyled content.";

/// An artifact already in the conversation, as the chat layers know it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingArtifactSummary {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub artifact_type: String,
}

/// The canvas mode an assistant's `chatConfig.defaultCanvasMode` selects: on for every
/// artifact type, one specific type, or off.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanvasMode {
    /// `true` or `"auto"`.
    Auto,
    /// A specific artifact type id, e.g. `"application/mermaid"`.
    Type(String),
}

/// The artifact catalog the tool instruction embeds.
///
/// `labels` is `CANVAS_TYPE_LABELS`; `summary` is what `assembleArtifactContext(null,
/// "summary")` returns; `full` maps a type id to `assembleArtifactContext(type, "full")`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ArtifactContext {
    pub labels: BTreeMap<String, String>,
    pub summary: String,
    pub full: BTreeMap<String, String>,
}

/// The optional parts of the tool instruction.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ToolInstructionOptions {
    /// The artifact the user is currently viewing, if any.
    pub target_artifact_id: Option<String>,
    pub canvas_mode: Option<CanvasMode>,
    /// Artifacts already in this conversation, newest first.
    pub existing_artifacts: Vec<ExistingArtifactSummary>,
}

/// The tool usage instruction, appended when the assistant has tools resolved.
#[must_use]
pub fn build_tool_instruction(
    tool_names: &[String],
    options: &ToolInstructionOptions,
    artifacts: &ArtifactContext,
) -> String {
    let mut instruction = format!(
        concat!(
            "\n\n## Available Tools\n",
            "You have these tools: {}.\n",
            "IMPORTANT: When users ask questions that require external information, current events, calculations, or data processing, you MUST use the appropriate tool. Do NOT fabricate URLs, links, citations, or sources — always use a tool to get real information. If you have a web_search tool, use it for any factual claim that needs a source.\n\n",
            "CAPABILITY HONESTY: If the user asks you to fetch or open a URL and no dedicated HTTP-fetch tool is installed, use your web_search tool with that URL (or a query describing its content) and answer from the results. If that also fails, state the limitation accurately — never claim \"the platform has no HTTP/external request support\" or invent a platform capability you do not have.",
        ),
        tool_names.join(", ")
    );

    if !tool_names.iter().any(|name| name == "create_artifact") {
        return instruction;
    }

    match &options.canvas_mode {
        Some(CanvasMode::Auto) => {
            instruction.push_str(&format!(
                concat!(
                    "\n\n## Canvas Mode (ACTIVE)\n",
                    "The user has enabled Canvas mode. You MUST deliver your response content as an artifact — create_artifact for new content, update_artifact when revising an artifact that already exists in this conversation. Render your output as a live artifact in the preview panel instead of inline text. {}\n\n{}",
                ),
                artifacts.summary, DESIGN_QUALITY_REMINDER,
            ));
        }
        Some(mode) if artifacts.labels.contains_key(mode_label(mode)) => {
            let canvas_type = mode_label(mode);
            let label = artifacts.labels.get(canvas_type).map_or("", String::as_str);
            let full = artifacts.full.get(canvas_type).map_or("", String::as_str);
            instruction.push_str(&format!(
                concat!(
                    "\n\n## Canvas Mode (ACTIVE — {})\n",
                    "The user has enabled Canvas mode with a specific artifact type. Deliver your output as a {} artifact (type=\"{}\") — create_artifact for new content, or update_artifact when the user is revising an artifact that already exists in this conversation. Render your output as a live artifact in the preview panel instead of inline text.\n\n{}\n\n{}",
                ),
                label, label, canvas_type, full, DESIGN_QUALITY_REMINDER,
            ));
        }
        _ => {
            instruction.push_str(&format!(
                concat!(
                    "\n\n## Artifacts\n",
                    "When creating substantial content (more than 15 lines of code, full HTML pages, React components, SVG graphics, diagrams, or long documents), use the create_artifact tool to render it in a live preview panel. Keep short code snippets, brief explanations, and simple answers inline in your response. {}\n\n{}",
                ),
                artifacts.summary, DESIGN_QUALITY_REMINDER,
            ));
        }
    }

    if !tool_names.iter().any(|name| name == "update_artifact") {
        return instruction;
    }

    instruction.push_str("\n\nWhen the user asks to modify, fix, or change an existing artifact, use update_artifact with the artifact's ID (from the create_artifact result) instead of creating a new one. Always provide the full updated content, not just the diff.");

    // Tool results are not replayed into later turns, so without this list the model has
    // no id to pass to update_artifact and every revision became a separate v1 artifact
    // instead of a new version of the same one (QA TC-809).
    if !options.existing_artifacts.is_empty() {
        let list = options
            .existing_artifacts
            .iter()
            .map(|artifact| {
                // The old code swapped every double quote in the title for a single one.
                format!(
                    "- \"{}\" ({}) id=\"{}\"",
                    artifact.title.replace('"', "'"),
                    artifact.artifact_type,
                    artifact.id
                )
            })
            .collect::<Vec<String>>()
            .join("\n");
        instruction.push_str(&format!(
            "\n\nArtifacts already in this conversation (newest first):\n{list}\nA request to change, fix, restyle, extend or translate one of these is a REVISION: call update_artifact with its id so it gains a new version. Use create_artifact only for a separate, new deliverable."
        ));
    }

    if let Some(target) = &options.target_artifact_id {
        let viewed = options
            .existing_artifacts
            .iter()
            .find(|artifact| &artifact.id == target);
        let specific_type = match &options.canvas_mode {
            Some(mode) if artifacts.labels.contains_key(mode_label(mode)) => {
                Some(mode_label(mode).to_owned())
            }
            _ => None,
        };
        match (specific_type, viewed) {
            (Some(specific), Some(viewed)) if viewed.artifact_type != specific => {
                // The toolbar asks for a different type than the open artifact — that is a
                // new deliverable, not an edit of the open one.
                instruction.push_str(&format!(
                    concat!(
                        "\n\nThe user is viewing artifact \"{}\" ({}), but Canvas mode now asks for a {}. ",
                        "Use create_artifact with type=\"{}\" for this request."
                    ),
                    target,
                    viewed.artifact_type,
                    artifacts
                        .labels
                        .get(&specific)
                        .map_or("", String::as_str),
                    specific,
                ));
            }
            _ => {
                instruction.push_str(&format!(
                    "\n\nThe user is currently viewing artifact \"{target}\". When they ask for changes, modifications, or updates to \"the artifact\", \"this\", or the current content, use update_artifact with id=\"{target}\"."
                ));
            }
        }
    }

    instruction
}

fn mode_label(mode: &CanvasMode) -> &str {
    match mode {
        CanvasMode::Auto => "auto",
        CanvasMode::Type(canvas_type) => canvas_type,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::error::Error;

    fn context() -> ArtifactContext {
        ArtifactContext {
            labels: BTreeMap::from([
                ("text/html".to_owned(), "HTML page".to_owned()),
                (
                    "application/mermaid".to_owned(),
                    "Mermaid diagram".to_owned(),
                ),
                ("application/react".to_owned(), "React component".to_owned()),
            ]),
            summary: "[artifact-summary]".to_owned(),
            full: BTreeMap::from([
                (
                    "text/html".to_owned(),
                    "[artifact-full:text/html]".to_owned(),
                ),
                (
                    "application/mermaid".to_owned(),
                    "[artifact-full:application/mermaid]".to_owned(),
                ),
            ]),
        }
    }

    fn names(values: &[&str]) -> Vec<String> {
        values.iter().map(|name| (*name).to_owned()).collect()
    }

    fn options(value: Value) -> Result<ToolInstructionOptions, Box<dyn Error>> {
        Ok(ToolInstructionOptions {
            target_artifact_id: value
                .get("targetArtifactId")
                .and_then(Value::as_str)
                .map(str::to_owned),
            canvas_mode: match value.get("canvasMode") {
                Some(Value::Bool(true)) => Some(CanvasMode::Auto),
                Some(Value::String(text)) => {
                    if text == "auto" {
                        Some(CanvasMode::Auto)
                    } else {
                        Some(CanvasMode::Type(text.clone()))
                    }
                }
                _ => None,
            },
            existing_artifacts: value
                .get("existingArtifacts")
                .and_then(Value::as_array)
                .map_or_else(Vec::new, |items| {
                    items
                        .iter()
                        .filter_map(|item| serde_json::from_value(item.clone()).ok())
                        .collect()
                }),
        })
    }

    use serde_json::Value;

    #[test]
    fn the_base_instruction_lists_the_tools() -> Result<(), Box<dyn Error>> {
        let text = build_tool_instruction(
            &names(&["web_search"]),
            &ToolInstructionOptions::default(),
            &context(),
        );
        assert!(text.starts_with("\n\n## Available Tools\nYou have these tools: web_search."));
        assert!(text.contains("CAPABILITY HONESTY"));
        assert!(!text.contains("## Artifacts"));
        Ok(())
    }

    #[test]
    fn the_canvas_branches_pick_their_sections() -> Result<(), Box<dyn Error>> {
        let artifacts = context();
        let plain = build_tool_instruction(
            &names(&["create_artifact"]),
            &options(json!({}))?,
            &artifacts,
        );
        assert!(plain.contains("## Artifacts\n"));
        let auto = build_tool_instruction(
            &names(&["create_artifact"]),
            &options(json!({"canvasMode": true}))?,
            &artifacts,
        );
        assert!(auto.contains("## Canvas Mode (ACTIVE)\n"));
        // Auto mode embeds the summary of all types, not a per-type section.
        assert!(auto.contains("[artifact-summary]"));
        assert!(!auto.contains("[artifact-full:"));
        let typed = build_tool_instruction(
            &names(&["create_artifact"]),
            &options(json!({"canvasMode": "text/html"}))?,
            &artifacts,
        );
        assert!(typed.contains("## Canvas Mode (ACTIVE — HTML page)"));
        assert!(typed.contains("[artifact-full:text/html]"));
        Ok(())
    }

    #[test]
    fn revisions_point_at_the_existing_artifact() -> Result<(), Box<dyn Error>> {
        let artifacts = context();
        let text = build_tool_instruction(
            &names(&["create_artifact", "update_artifact"]),
            &options(json!({
                "targetArtifactId": "art_1",
                "existingArtifacts": [{"id": "art_1", "title": "Tombol", "type": "text/html"}]
            }))?,
            &artifacts,
        );
        assert!(text.contains("\"Tombol\" (text/html) id=\"art_1\""));
        assert!(text.contains("is a REVISION: call update_artifact with its id"));
        assert!(text.contains("use update_artifact with id=\"art_1\""));
        Ok(())
    }
}
