//! The tool approval policy.
//!
//! Ported from `src/lib/tools/approval.ts`: which tools are exempt and when a call pauses
//! for the user's approval. The pending-decision wait itself (an in-process `Map` in the
//! old code) is not ported — it moves to the store (differences row 2).

use serde_json::Value;

use crate::assistant::config::ToolApproval;

/// Tools that only read, compute, or write inside the user's own workspace. Everything
/// else — MCP, custom/OpenAPI, community and workflow tools, and the builtins that reach
/// outside (channel_dispatch sends messages, file_operations mints storage URLs,
/// code_interpreter runs sandboxed arbitrary code) — is "risky".
pub const AUTO_APPROVED_TOOLS: [&str; 13] = [
    "knowledge_search",
    "document_analysis",
    "customer_lookup",
    "web_search",
    "calculator",
    "date_time",
    "json_transform",
    "text_utilities",
    "create_artifact",
    "update_artifact",
    "ocr_document",
    "saveMemory",
    "forgetMemory",
];

/// Reads the assistant's guard-rails JSON and picks the approval mode.
///
/// The old function took the raw `guardRails` column, which was `z.unknown()`: anything
/// unset or unknown counts as the safe default, "risky". For a parsed
/// [`GuardRailsConfig`](crate::assistant::config::GuardRailsConfig), use its
/// `tool_approval()` method instead — same default.
#[must_use]
pub fn resolve_tool_approval_mode(raw: Option<&Value>) -> ToolApproval {
    match raw
        .and_then(|config| config.get("toolApproval"))
        .and_then(Value::as_str)
    {
        Some("off") => ToolApproval::Off,
        Some("all") => ToolApproval::All,
        Some("risky") => ToolApproval::Risky,
        _ => ToolApproval::Risky,
    }
}

/// Whether a tool call must wait for the user's approval in this mode.
#[must_use]
pub fn tool_needs_approval(name: &str, mode: ToolApproval) -> bool {
    match mode {
        ToolApproval::Off => false,
        ToolApproval::All => true,
        ToolApproval::Risky => !AUTO_APPROVED_TOOLS.contains(&name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::error::Error;

    #[test]
    fn the_mode_defaults_to_risky() -> Result<(), Box<dyn Error>> {
        for raw in [
            json!(null),
            json!({}),
            json!({"toolApproval": "bogus"}),
            json!(123),
        ] {
            assert_eq!(resolve_tool_approval_mode(Some(&raw)), ToolApproval::Risky);
        }
        assert_eq!(resolve_tool_approval_mode(None), ToolApproval::Risky);
        assert_eq!(
            resolve_tool_approval_mode(Some(&json!({"toolApproval": "off"}))),
            ToolApproval::Off
        );
        Ok(())
    }

    #[test]
    fn risky_spares_only_the_read_only_builtins() {
        assert!(tool_needs_approval("channel_dispatch", ToolApproval::Risky));
        assert!(tool_needs_approval("code_interpreter", ToolApproval::Risky));
        assert!(!tool_needs_approval("web_search", ToolApproval::Risky));
        assert!(!tool_needs_approval("saveMemory", ToolApproval::Risky));
        assert!(tool_needs_approval("web_search", ToolApproval::All));
        assert!(!tool_needs_approval("channel_dispatch", ToolApproval::Off));
    }
}
