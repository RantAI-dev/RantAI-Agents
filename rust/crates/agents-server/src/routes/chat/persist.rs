//! The rows the server writes after the answer.
//!
//! Old: `buildPersistedUserRow` and the persistence block of `runChat` in
//! `src/features/chat-public/service.ts` (the `createDashboardMessages` call).
//!
//! The dashboard writes the same rows itself (`POST /api/dashboard/chat/sessions/{id}/messages`)
//! so the chat appears in the sidebar while it streams; the server writes them too, so an answer
//! that the client never received (a closed tab, a network blip) is not lost. Both paths key on
//! the same ids, so the last writer wins with the same value.

use agents_store::sessions::{self, NewMessage};
use agents_store::{PgPool, StoreResult};
use serde_json::Value;

use crate::routes::chat::request::ChatMessage;

/// The user's message, as the row to write.
#[derive(Debug, Clone, PartialEq)]
pub struct UserRow {
    pub id: String,
    pub content: String,
    pub reply_to: Option<String>,
    pub edit_history: Option<Value>,
}

/// Builds the user's row. Only the fields with a usable value are set: a column the client
/// did not send keeps the one it has.
#[must_use]
pub fn build_user_row(message: &ChatMessage) -> UserRow {
    UserRow {
        id: message.id.clone(),
        content: message.content.clone(),
        reply_to: message
            .reply_to
            .as_deref()
            .filter(|reply| !reply.is_empty())
            .map(str::to_owned),
        edit_history: sanitize_edit_history(message.edit_history.as_ref()),
    }
}

/// One version of an edited message.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditHistoryEntry {
    /// What the user wrote.
    pub content: String,
    /// What the assistant answered, when it was kept.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_response: Option<String>,
    /// When the version was written.
    pub edited_at: String,
}

/// The edit history as the column accepts it.
///
/// An entry that is not an object, or that has no text, is dropped: the write is best-effort
/// and must not fail a stream that is already on the wire.
#[must_use]
pub fn sanitize_edit_history(input: Option<&Value>) -> Option<Value> {
    let items = input?.as_array()?;
    let mut entries: Vec<EditHistoryEntry> = Vec::with_capacity(items.len());
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(content) = object.get("content").and_then(Value::as_str) else {
            continue;
        };
        entries.push(EditHistoryEntry {
            content: content.to_owned(),
            assistant_response: object
                .get("assistantResponse")
                .and_then(Value::as_str)
                .map(str::to_owned),
            edited_at: object
                .get("editedAt")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
        });
    }
    Some(serde_json::to_value(entries).unwrap_or(Value::Null))
}

/// Writes the user's message and the assistant's answer into a session.
///
/// The write is best-effort: a database hiccup must not fail a stream that is already on the
/// wire, so the caller logs the failure and moves on.
pub async fn persist(
    db: &PgPool,
    user_id: &str,
    session_id: &str,
    assistant_message_id: &str,
    user_message: Option<&UserRow>,
    text: &str,
    reasoning: &str,
) -> StoreResult<()> {
    let mut rows: Vec<NewMessage> = Vec::with_capacity(2);
    if let Some(user_message) = user_message {
        rows.push(NewMessage {
            id: Some(user_message.id.clone()),
            role: "user".to_owned(),
            content: user_message.content.clone(),
            reply_to: user_message.reply_to.clone(),
            edit_history: user_message.edit_history.clone(),
            sources: None,
            metadata: None,
        });
    }
    rows.push(NewMessage {
        id: Some(assistant_message_id.to_owned()),
        role: "assistant".to_owned(),
        content: text.to_owned(),
        reply_to: None,
        edit_history: None,
        sources: None,
        metadata: (!reasoning.is_empty()).then(|| serde_json::json!({ "reasoning": reasoning })),
    });
    sessions::add_messages(db, user_id, session_id, &rows).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_malformed_edit_history_entry_is_dropped() {
        let history = sanitize_edit_history(Some(&json!([
            {"content": "first", "editedAt": "2026-01-01T00:00:00.000Z"},
            {"noContent": true},
            "not an object",
            {"content": "second", "assistantResponse": "the answer", "editedAt": "2026-01-02T00:00:00.000Z"},
        ])));
        let entries = history.expect("a list");
        let entries = entries.as_array().expect("a list");
        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries
                .first()
                .and_then(|e| e.get("content"))
                .and_then(Value::as_str),
            Some("first")
        );
        assert_eq!(
            entries
                .get(1)
                .and_then(|e| e.get("assistantResponse"))
                .and_then(Value::as_str),
            Some("the answer")
        );
    }

    #[test]
    fn an_edit_history_that_is_not_a_list_is_nothing() {
        assert!(sanitize_edit_history(Some(&json!("nope"))).is_none());
        assert!(sanitize_edit_history(None).is_none());
    }

    #[test]
    fn the_user_row_keeps_only_the_fields_with_a_value() {
        let message = ChatMessage {
            id: "m1".to_owned(),
            role: "user".to_owned(),
            content: "hello".to_owned(),
            reply_to: Some(String::new()),
            edit_history: Some(json!([{"content": "old"}])),
        };
        let row = build_user_row(&message);
        assert_eq!(row.id, "m1");
        assert_eq!(row.content, "hello");
        assert_eq!(row.reply_to, None);
        assert!(row.edit_history.is_some());
    }
}
