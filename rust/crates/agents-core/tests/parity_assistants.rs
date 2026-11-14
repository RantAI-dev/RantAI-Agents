//! Parity with the TypeScript assistants and system-prompt modules.
//!
//! The cases come from `port/cases/assistants.jsonl`, which `port/oracle/assistants.ts`
//! generated from `port/cases/assistants.in.jsonl`: every expected value is what the OLD
//! TypeScript returned, none of them was written by hand.
//!
//! Three groups of cases are skipped on purpose; each points at its row in
//! `docs/port/differences.md`:
//!
//! - Edits and binding writes on a built-in assistant: the old code allowed every
//!   logged-in user; the port allows only a platform admin (row 25).
//! - Binding writes by a member of the org who may not edit the assistant: the old code
//!   checked only org membership; the port requires the same role as editing (row 26).
//! - JSON config validation: the old code accepted the config columns as `z.unknown()`;
//!   the port validates and range-checks them, so cases where only a config error differs
//!   are skipped (row 28).
//!
//! Validation cases compare the SET of failing field paths, not the message text. The
//! prompt-variable clock cases replace the locale-dependent old values and the ISO port
//! values with placeholders (row 31).

use std::collections::{BTreeMap, HashSet};
use std::error::Error;
use std::fs;

use agents_core::assistant::access::{Action, Actor, AssistantRef, can};
use agents_core::assistant::bindings::{merge_hidden_tool_ids, non_empty_string_ids};
use agents_core::assistant::completeness::{
    CompletenessFormState, TabId, TabStatus, compute_tab_status, is_deploy_ready, is_model_valid,
    is_name_valid, is_system_prompt_valid,
};
use agents_core::assistant::config::ToolApproval;
use agents_core::assistant::input::{validate_create_value, validate_update_value};
use agents_core::assistant::wizard::{
    KnownIds, ProposeAgentInput, WizardContext, build_wizard_system_prompt, filter_known_ids,
    sanitize_proposal,
};
use agents_core::org::OrgRole;
use agents_core::prompt::approval::{
    AUTO_APPROVED_TOOLS, resolve_tool_approval_mode, tool_needs_approval,
};
use agents_core::prompt::guard_rails::build_guard_rails_prompt;
use agents_core::prompt::instructions::{
    ArtifactContext, CanvasMode, ExistingArtifactSummary, LIVE_CHAT_HANDOFF_INSTRUCTION,
    ToolInstructionOptions, build_tool_instruction,
};
use agents_core::prompt::response_format::get_response_format_instruction;
use agents_core::prompt::variables::{
    AVAILABLE_VARIABLES, VARIABLE_DESCRIPTIONS, VariableContext, resolve_prompt_variables,
    variable_description,
};
use serde_json::{Value, json};

const CASES: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../port/cases/assistants.jsonl"
);

/// The instant the oracle pinned (the old code read `new Date()` for the clock variables).
const NOW: &str = "2026-11-14T08:30:00.000Z";

/// The four JSON config columns, which the new code validates and the old one did not.
const CONFIG_PREFIXES: [&str; 4] = [
    "/memoryConfig",
    "/modelConfig",
    "/chatConfig",
    "/guardRails",
];

/// The functions whose case returns a decision (with skip rules) instead of a value.
const DECISION_FNS: [&str; 8] = [
    "validateCreate",
    "validateUpdate",
    "viewAssistant",
    "editAssistant",
    "deleteAssistant",
    "setAssistantToolBindings",
    "setAssistantSkillBindings",
    "setDefaultAssistant",
];

/// What a case did: checked against the old behaviour, or skipped because a documented
/// deliberate difference applies.
enum Outcome {
    Checked,
    Skipped(&'static str),
}

/// The artifact tables stand in for the real ones, exactly as the oracle stubs them.
fn stub_artifacts() -> ArtifactContext {
    let labels = BTreeMap::from([
        ("text/html".to_owned(), "HTML page".to_owned()),
        ("application/react".to_owned(), "React component".to_owned()),
        (
            "application/mermaid".to_owned(),
            "Mermaid diagram".to_owned(),
        ),
    ]);
    ArtifactContext {
        full: labels
            .keys()
            .map(|canvas_type| {
                (
                    canvas_type.clone(),
                    format!("[artifact-full:{canvas_type}]"),
                )
            })
            .collect(),
        labels,
        summary: "[artifact-summary]".to_owned(),
    }
}

fn arg(args: &[Value], index: usize) -> Result<&Value, std::io::Error> {
    args.get(index)
        .ok_or_else(|| std::io::Error::other(format!("missing argument {index}")))
}

fn arg_str(args: &[Value], index: usize) -> Result<&str, std::io::Error> {
    arg(args, index)?
        .as_str()
        .ok_or_else(|| std::io::Error::other(format!("argument {index} is not a string")))
}

fn arg_bool(args: &[Value], index: usize, key: &str) -> bool {
    arg(args, index)
        .ok()
        .and_then(|value| value.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn strings(value: &Value) -> Result<Vec<String>, Box<dyn Error>> {
    serde_json::from_value(value.clone()).map_err(|error| {
        Box::new(std::io::Error::other(format!(
            "expected string array: {error}"
        ))) as Box<dyn Error>
    })
}

fn actor(args: &[Value], index: usize) -> Actor {
    let ctx = arg(args, index).cloned().unwrap_or(Value::Null);
    Actor {
        user_id: "user_oracle".to_owned(),
        organization_id: ctx
            .get("organizationId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        role: ctx
            .get("role")
            .and_then(Value::as_str)
            .and_then(OrgRole::parse),
        is_platform_admin: arg_bool(args, index, "isPlatformAdmin"),
    }
}

fn target(args: &[Value], index: usize) -> AssistantRef {
    let row = arg(args, index).cloned().unwrap_or(Value::Null);
    AssistantRef {
        organization_id: row
            .get("organizationId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        is_built_in: row
            .get("isBuiltIn")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

/// Whether a failing path sits inside one of the JSON config columns.
fn is_config_path(path: &str) -> bool {
    CONFIG_PREFIXES
        .iter()
        .any(|prefix| path.starts_with(prefix))
}

/// Validation: compare the SET of failing field paths, not the messages.
fn validation(
    body: &Value,
    expected: &Value,
    validate: fn(&Value) -> Vec<agents_core::validation::FieldError>,
) -> Result<Outcome, Box<dyn Error>> {
    let old_ok = expected.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let old_paths: HashSet<String> = expected
        .get("errors")
        .and_then(Value::as_array)
        .map(|errors| {
            errors
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let new_paths: HashSet<String> = validate(body)
        .into_iter()
        .map(|error| error.field)
        .collect();
    let effective: HashSet<String> = new_paths
        .iter()
        .filter(|path| !is_config_path(path))
        .cloned()
        .collect();

    if old_ok {
        // The old schema never rejected a config value; a difference may only be a config
        // error of the new validation (differences row 28).
        if !new_paths.is_empty() && effective.is_empty() {
            return Ok(Outcome::Skipped(
                "differences row 28: JSON config validation",
            ));
        }
        assert!(
            effective.is_empty(),
            "the new code rejects {effective:?} where the old code accepted the body"
        );
    } else {
        assert_eq!(
            old_paths, effective,
            "failing paths differ\nactual:   {new_paths:?}\nexpected: {old_paths:?}"
        );
    }
    Ok(Outcome::Checked)
}

/// An access case: the old service status projected to the one access decision, plus the
/// merged binding list a write produced.
fn access(name: &str, args: &[Value], expected: &Value) -> Result<Outcome, Box<dyn Error>> {
    let status = expected
        .get("status")
        .and_then(Value::as_u64)
        .ok_or_else(|| std::io::Error::other("an access case has no status"))?;
    let old_allowed = status == 200;
    let actor = actor(args, 0);
    let target = target(args, 1);

    let action = match name {
        "viewAssistant" => Action::View,
        "editAssistant" => Action::Edit,
        "deleteAssistant" => Action::Delete,
        "setAssistantToolBindings" | "setAssistantSkillBindings" => Action::EditBindings,
        other => return Err(std::io::Error::other(format!("unknown action {other}")).into()),
    };

    // The deliberate differences (each skip names its differences.md row): a built-in
    // assistant is editable only by a platform admin; bindings need the edit role.
    if matches!(action, Action::Edit | Action::EditBindings)
        && target.is_built_in
        && !actor.is_platform_admin
    {
        return Ok(Outcome::Skipped(
            "differences row 25: built-ins are read-only except for a platform admin",
        ));
    }
    if action == Action::EditBindings
        && !target.is_built_in
        && actor.organization_id.as_ref() == target.organization_id.as_ref()
        && !actor.role.is_some_and(OrgRole::can_edit)
    {
        return Ok(Outcome::Skipped(
            "differences row 26: bindings need the same role as editing",
        ));
    }

    let new_allowed = can(&actor, action, &target);
    assert_eq!(
        new_allowed, old_allowed,
        "access differs for {name}: actor {actor:?} target {target:?} (old status {status})"
    );

    // The write itself: what the old service wrote is what the merge produces.
    if old_allowed {
        match name {
            "setAssistantToolBindings" => {
                let tool_ids: Vec<Value> = arg(args, 2)?.as_array().cloned().unwrap_or_default();
                let hidden = strings(arg(args, 3)?)?;
                assert_eq!(
                    merge_hidden_tool_ids(&tool_ids, &hidden),
                    strings(expected.get("merged").unwrap_or(&Value::Null))?,
                    "the merged tool list differs"
                );
            }
            "setAssistantSkillBindings" => {
                let skill_ids: Vec<Value> = arg(args, 2)?.as_array().cloned().unwrap_or_default();
                assert_eq!(
                    non_empty_string_ids(&skill_ids),
                    strings(expected.get("replaced").unwrap_or(&Value::Null))?,
                    "the replaced skill list differs"
                );
            }
            _ => {}
        }
    }
    Ok(Outcome::Checked)
}

fn known_ids(value: &Value) -> KnownIds {
    let set = |key: &str| -> HashSet<String> {
        value
            .get(key)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    };
    KnownIds {
        models: set("models"),
        tools: set("tools"),
        skills: set("skills"),
        mcp: set("mcp"),
        kbs: set("kbs"),
    }
}

/// The old clock output depends on the server locale; the port prints ISO (row 31). Both
/// sides are replaced with placeholders, everything else is compared as-is.
fn normalize_clock(text: &str) -> String {
    text.replace("11/14/2026, 8:30:00 AM", "<datetime>")
        .replace("11/14/2026", "<date>")
        .replace("8:30:00 AM", "<time>")
        .replace("2026-11-14 08:30:00", "<datetime>")
        .replace("2026-11-14", "<date>")
        .replace("08:30:00", "<time>")
}

fn variable_context(value: &Value) -> VariableContext {
    let text = |key: &str| value.get(key).and_then(Value::as_str).map(str::to_owned);
    VariableContext {
        user_name: text("userName"),
        assistant_name: text("assistantName"),
        language: text("language"),
    }
}

fn tool_options(value: Option<&Value>) -> ToolInstructionOptions {
    let Some(value) = value else {
        return ToolInstructionOptions::default();
    };
    let canvas_mode = match value.get("canvasMode") {
        Some(Value::Bool(true)) => Some(CanvasMode::Auto),
        Some(Value::String(text)) => {
            if text == "auto" {
                Some(CanvasMode::Auto)
            } else {
                Some(CanvasMode::Type(text.clone()))
            }
        }
        _ => None,
    };
    ToolInstructionOptions {
        target_artifact_id: value
            .get("targetArtifactId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        canvas_mode,
        existing_artifacts: value
            .get("existingArtifacts")
            .and_then(Value::as_array)
            .map_or_else(Vec::new, |items| {
                items
                    .iter()
                    .filter_map(|item| {
                        serde_json::from_value::<ExistingArtifactSummary>(item.clone()).ok()
                    })
                    .collect()
            }),
    }
}

fn tool_names(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn approval_mode(value: &Value) -> ToolApproval {
    match value.as_str() {
        Some("off") => ToolApproval::Off,
        Some("all") => ToolApproval::All,
        _ => ToolApproval::Risky,
    }
}

/// Compare two JSON values, treating `1` and `1.0` as the same number.
fn same_json(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => match (left.as_f64(), right.as_f64()) {
            (Some(left), Some(right)) => left == right,
            _ => left == right,
        },
        (Value::Array(left), Value::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right.iter())
                    .all(|(left, right)| same_json(left, right))
        }
        (Value::Object(left), Value::Object(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .all(|(key, value)| right.get(key).is_some_and(|other| same_json(value, other)))
        }
        _ => left == right,
    }
}

fn dispatch(name: &str, args: &[Value]) -> Result<Value, Box<dyn Error>> {
    let value = match name {
        "isNameValid" => json!(is_name_valid(arg_str(args, 0)?)),
        "isSystemPromptValid" => json!(is_system_prompt_valid(arg_str(args, 0)?)),
        "isModelValid" => {
            let available = strings(arg(args, 1)?)?;
            json!(is_model_valid(arg_str(args, 0)?, &available))
        }
        "computeTabStatus" => {
            let form: CompletenessFormState = serde_json::from_value(arg(args, 0)?.clone())?;
            let tab = TabId::parse(arg_str(args, 1)?)
                .ok_or_else(|| std::io::Error::other("unknown tab"))?;
            serde_json::to_value(compute_tab_status(&form, tab))?
        }
        "isDeployReady" => {
            let form: CompletenessFormState = serde_json::from_value(arg(args, 0)?.clone())?;
            serde_json::to_value(is_deploy_ready(&form))?
        }
        "filterKnownIds" => {
            let known: HashSet<String> = strings(arg(args, 1)?)?.into_iter().collect();
            serde_json::to_value(filter_known_ids(&strings(arg(args, 0)?)?, &known))?
        }
        "buildWizardSystemPrompt" => {
            let ctx: WizardContext = serde_json::from_value(arg(args, 0)?.clone())?;
            json!(build_wizard_system_prompt(&ctx))
        }
        "sanitizeProposal" => {
            let payload: ProposeAgentInput = serde_json::from_value(arg(args, 0)?.clone())?;
            let known = known_ids(arg(args, 1)?);
            let result = sanitize_proposal(&payload, &known);
            serde_json::to_value(json!({
                "payload": result.payload,
                "dropped": result.dropped,
            }))?
        }
        "buildGuardRailsPrompt" => {
            let config = arg(args, 0)?;
            let config = if config.is_null() { None } else { Some(config) };
            json!(build_guard_rails_prompt(config))
        }
        "resolvePromptVariables" => {
            let context = variable_context(arg(args, 1)?);
            json!(normalize_clock(&resolve_prompt_variables(
                arg_str(args, 0)?,
                &context,
                NOW
            )))
        }
        "availableVariables" => serde_json::to_value(AVAILABLE_VARIABLES)?,
        "variableDescriptions" => {
            let map: BTreeMap<String, String> = VARIABLE_DESCRIPTIONS
                .iter()
                .map(|(name, description)| ((*name).to_owned(), (*description).to_owned()))
                .collect();
            serde_json::to_value(map)?
        }
        "getResponseFormatInstruction" => {
            json!(get_response_format_instruction(arg(args, 0)?.as_str()))
        }
        "buildToolInstruction" => {
            let names = tool_names(arg(args, 0)?);
            let raw = arg(args, 1)?;
            let options = if raw.is_object() {
                tool_options(Some(raw))
            } else {
                tool_options(None)
            };
            json!(build_tool_instruction(&names, &options, &stub_artifacts()))
        }
        "liveChatHandoffInstruction" => json!(LIVE_CHAT_HANDOFF_INSTRUCTION),
        "resolveToolApprovalMode" => {
            let raw = arg(args, 0)?;
            let raw = if raw.is_null() { None } else { Some(raw) };
            serde_json::to_value(resolve_tool_approval_mode(raw))?
        }
        "toolNeedsApproval" => {
            let mode = approval_mode(arg(args, 1)?);
            json!(tool_needs_approval(arg_str(args, 0)?, mode))
        }
        "autoApprovedTools" => serde_json::to_value(AUTO_APPROVED_TOOLS)?,
        other => return Err(std::io::Error::other(format!("unknown function {other}")).into()),
    };
    Ok(value)
}

/// A case whose result is a decision (or a validation) rather than a plain value.
fn dispatch_decision(
    name: &str,
    args: &[Value],
    expected: &Value,
) -> Result<Outcome, Box<dyn Error>> {
    match name {
        "validateCreate" => validation(arg(args, 0)?, expected, validate_create_value),
        "validateUpdate" => validation(arg(args, 0)?, expected, validate_update_value),
        "setDefaultAssistant" => {
            let role = arg(args, 0)?.as_str().and_then(OrgRole::parse);
            let actor = Actor {
                user_id: "user_oracle".to_owned(),
                organization_id: Some(arg_str(args, 2)?.to_owned()),
                role,
                is_platform_admin: false,
            };
            let target = target(args, 1);
            let old_allowed = expected
                .get("allowed")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            assert_eq!(
                can(&actor, Action::SetDefault, &target),
                old_allowed,
                "set-default differs: role {role:?} target {target:?}"
            );
            Ok(Outcome::Checked)
        }
        "viewAssistant"
        | "editAssistant"
        | "deleteAssistant"
        | "setAssistantToolBindings"
        | "setAssistantSkillBindings" => access(name, args, expected),
        other => Err(std::io::Error::other(format!("unknown function {other}")).into()),
    }
}

#[test]
fn assistant_cases_match_the_typescript_oracle() -> Result<(), Box<dyn Error>> {
    let text = fs::read_to_string(CASES)?;
    let mut checked = 0usize;
    let mut skipped: Vec<(String, &'static str)> = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let case: Value = serde_json::from_str(line)?;
        let name = case
            .get("fn")
            .and_then(Value::as_str)
            .ok_or_else(|| std::io::Error::other("a case has no function name"))?
            .to_owned();
        let args = case
            .get("args")
            .and_then(Value::as_array)
            .ok_or_else(|| std::io::Error::other("a case has no arguments"))?
            .clone();
        let expected = case
            .get("expected")
            .ok_or_else(|| std::io::Error::other("a case has no expected value"))?
            .clone();

        let outcome = if DECISION_FNS.contains(&name.as_str()) {
            dispatch_decision(&name, &args, &expected)?
        } else {
            let actual = dispatch(&name, &args)?;
            if name == "resolvePromptVariables" {
                let actual_text = actual.as_str().unwrap_or_default();
                let expected_text = normalize_clock(expected.as_str().unwrap_or_default());
                assert_eq!(
                    actual_text, expected_text,
                    "case {name} {args:?}\nactual:   {actual_text}\nexpected: {expected_text}"
                );
            } else {
                assert!(
                    same_json(&actual, &expected),
                    "case {name} {args:?}\nactual:   {actual}\nexpected: {expected}"
                );
            }
            Outcome::Checked
        };
        match outcome {
            Outcome::Checked => checked += 1,
            Outcome::Skipped(row) => skipped.push((name.clone(), row)),
        }
    }

    assert!(checked >= 150, "only {checked} cases ran");
    // Every skip must be one of the deliberate differences, and there must be some.
    assert!(
        !skipped.is_empty(),
        "no case exercised a deliberate difference"
    );
    for (name, row) in &skipped {
        eprintln!("skipped: {name} ({row})");
    }
    Ok(())
}

/// `TabStatus` must carry the old spelling; the variable descriptions have no oracle
/// cases, so they are pinned here.
#[test]
fn the_shared_shapes_keep_their_old_names() -> Result<(), Box<dyn Error>> {
    assert_eq!(
        serde_json::to_value(TabStatus::RequiredMissing)?,
        json!("required-missing")
    );
    assert_eq!(
        variable_description("user_name"),
        Some("The current user's display name")
    );
    assert_eq!(variable_description("nonsense"), None);
    Ok(())
}
