//! The approval gate of a chat's tools: the wait for the user's decision, and the route that
//! records it.
//!
//! Old: `src/lib/tools/approval.ts` (`awaitToolApproval`, `respondToToolApproval`,
//! `gateToolsForApproval`) and `src/app/api/chat/tool-approval/route.ts`.
//!
//! The wire contract is the old one: the stream names the gated tools in `X-Tool-Approval`,
//! writes `tool-input-available` for the call and stays open; the client POSTs
//! `{ "toolCallId", "approved" }` to `/api/chat/tool-approval`; the call then runs, or answers
//! the model with the old refusal. What changed is where the decision waits: a row in
//! Postgres, read every [`ToolApprovalTiming::poll`], instead of a promise in this process
//! (docs/port/differences.md, rows 2 and 70).

use std::time::Instant;

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::routing::post;
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;

use agents_core::validation::FieldError;
use agents_store::StoreError;
use agents_store::approvals::{self, Decision};

use crate::AppState;
use crate::auth::CurrentUser;
use crate::config::ToolApprovalTiming;
use crate::http::ApiError;
use crate::http::json::Body;

/// The longest tool call id the route takes (the old schema's `max(200)`).
const MAX_TOOL_CALL_ID: usize = 200;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/chat/tool-approval", post(decide))
}

/// How a wait ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Approved,
    Denied,
    Timeout,
}

/// The output a call that was not approved gives the model (`OUTCOME_MESSAGE`).
#[must_use]
pub fn refusal(outcome: Outcome) -> Value {
    let (approval, message) = match outcome {
        Outcome::Denied | Outcome::Approved => (
            "denied",
            "The user declined this action. Do not retry it; tell the user it was not performed.",
        ),
        Outcome::Timeout => (
            "timeout",
            "The user did not approve this action in time, so it was not performed. Ask the user whether to try again.",
        ),
    };
    json!({"performed": false, "approval": approval, "message": message})
}

/// Deletes the row when the wait is dropped before it ends: the client went away and the
/// stream stopped in the middle of the wait.
struct OpenRow {
    db: PgPool,
    tool_call_id: String,
    user_id: String,
    closed: bool,
}

impl OpenRow {
    async fn close(mut self) {
        self.closed = true;
        if let Err(error) = approvals::close(&self.db, &self.tool_call_id, &self.user_id).await {
            tracing::warn!(error = %error, "the tool approval row could not be deleted");
        }
    }
}

impl Drop for OpenRow {
    fn drop(&mut self) {
        if self.closed {
            return;
        }
        let db = self.db.clone();
        let tool_call_id = std::mem::take(&mut self.tool_call_id);
        let user_id = std::mem::take(&mut self.user_id);
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(async move {
                let _ = approvals::close(&db, &tool_call_id, &user_id).await;
            });
        }
    }
}

/// Waits for the user's decision on a call.
///
/// # Errors
/// The pending decision could not be written; the call must not run (it fails closed).
pub async fn wait(
    db: &PgPool,
    tool_call_id: &str,
    user_id: &str,
    timing: ToolApprovalTiming,
) -> Result<Outcome, StoreError> {
    let deadline = Instant::now() + timing.timeout;
    let early = approvals::open(db, tool_call_id, user_id).await?;
    let row = OpenRow {
        db: db.clone(),
        tool_call_id: tool_call_id.to_owned(),
        user_id: user_id.to_owned(),
        closed: false,
    };
    let mut decision = early;
    while decision.is_none() {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        // No connection is held while the wait sleeps.
        tokio::time::sleep(timing.poll.min(deadline - now)).await;
        decision = match approvals::poll(db, tool_call_id, user_id).await {
            Ok(decision) => decision,
            Err(error) => {
                // A failed read is retried until the deadline; the call fails closed.
                tracing::warn!(error = %error, "the tool approval could not be read");
                None
            }
        };
    }
    row.close().await;
    Ok(match decision {
        Some(Decision::Approved) => Outcome::Approved,
        Some(Decision::Denied) => Outcome::Denied,
        None => Outcome::Timeout,
    })
}

#[derive(Serialize)]
struct Recorded {
    ok: bool,
}

/// `POST /api/chat/tool-approval`: the user's Approve or Deny for a gated call of their own
/// chat. Another user's call is a 404, the same answer a stale id gets.
async fn decide(
    State(state): State<AppState>,
    user: CurrentUser,
    body: Option<Body<Value>>,
) -> Result<Json<Recorded>, ApiError> {
    let Some(Body(body)) = body else {
        return Err(ApiError::from(vec![FieldError::new(
            "",
            "required",
            "A JSON body is required.",
        )]));
    };
    let (tool_call_id, approved) = parse(&body)?;
    let decision = if approved {
        Decision::Approved
    } else {
        Decision::Denied
    };
    match approvals::decide(&state.db, &tool_call_id, &user.id, decision).await {
        Ok(()) => Ok(Json(Recorded { ok: true })),
        Err(StoreError::NotFound) => Err(ApiError::new(
            agents_contracts::error_codes::ErrorCode::NotFound,
        )),
        Err(error) => {
            tracing::error!(error = %error, "the tool approval could not be recorded");
            Err(ApiError::new(
                agents_contracts::error_codes::ErrorCode::Internal,
            ))
        }
    }
}

/// The body: `{ "toolCallId": string (1–200), "approved": boolean }`. Every bad field is
/// listed, and a field the body may not carry is one of them.
fn parse(body: &Value) -> Result<(String, bool), ApiError> {
    let Some(object) = body.as_object() else {
        return Err(ApiError::from(vec![FieldError::new(
            "",
            "invalid_shape",
            "The body must be a JSON object.",
        )]));
    };
    let mut errors = Vec::new();
    for key in object.keys() {
        if key != "toolCallId" && key != "approved" {
            errors.push(FieldError::new(
                format!("/{key}"),
                "unknown_field",
                "This field is not part of the request.",
            ));
        }
    }
    let tool_call_id = match object.get("toolCallId") {
        None => {
            errors.push(FieldError::new(
                "/toolCallId",
                "required",
                "This field is required.",
            ));
            None
        }
        Some(Value::String(id)) if id.is_empty() => {
            errors.push(FieldError::new(
                "/toolCallId",
                "too_short",
                "This field must not be empty.",
            ));
            None
        }
        Some(Value::String(id)) if id.chars().count() > MAX_TOOL_CALL_ID => {
            errors.push(FieldError::new(
                "/toolCallId",
                "too_long",
                format!("This field must be at most {MAX_TOOL_CALL_ID} characters."),
            ));
            None
        }
        Some(Value::String(id)) => Some(id.clone()),
        Some(_) => {
            errors.push(FieldError::new(
                "/toolCallId",
                "invalid_type",
                "This field must be a string.",
            ));
            None
        }
    };
    let approved = match object.get("approved") {
        None => {
            errors.push(FieldError::new(
                "/approved",
                "required",
                "This field is required.",
            ));
            None
        }
        Some(Value::Bool(flag)) => Some(*flag),
        Some(_) => {
            errors.push(FieldError::new(
                "/approved",
                "invalid_type",
                "This field must be a boolean.",
            ));
            None
        }
    };
    match (tool_call_id, approved) {
        (Some(id), Some(flag)) if errors.is_empty() => Ok((id, flag)),
        _ => Err(ApiError::from(errors)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_refusals_are_the_old_outputs() {
        assert_eq!(
            refusal(Outcome::Denied).to_string(),
            r#"{"performed":false,"approval":"denied","message":"The user declined this action. Do not retry it; tell the user it was not performed."}"#
        );
        assert_eq!(
            refusal(Outcome::Timeout).get("approval"),
            Some(&json!("timeout"))
        );
    }

    #[test]
    fn the_body_lists_every_bad_field() {
        assert!(parse(&json!({"toolCallId": "c1", "approved": true})).is_ok());
        assert!(parse(&json!({"toolCallId": "", "approved": true})).is_err());
        assert!(parse(&json!({"toolCallId": "x".repeat(201), "approved": true})).is_err());
        assert!(parse(&json!({"toolCallId": "c1", "approved": "yes"})).is_err());
        assert!(parse(&json!({"toolCallId": "c1", "approved": true, "extra": 1})).is_err());
        assert!(parse(&json!([])).is_err());
    }
}
