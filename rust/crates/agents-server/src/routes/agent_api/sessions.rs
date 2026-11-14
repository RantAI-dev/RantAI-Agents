//! What a socket may do, and the conversations this process remembers.
//!
//! The conversation is the socket's, not a row: there is no session table and no migration in
//! this slice (differences.md row 144). A client that reconnects with the `sessionId` its `done`
//! frame named continues the same conversation, as long as it presents the same key and names
//! the same agent; the id is 128 random bits, so it cannot be guessed from another one.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::Duration;

use super::bodies::CompletionMessage;
use super::secret;

/// What a socket may do, and for how long.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    /// How long a connection that carried no key has to send one.
    pub auth_timeout: Duration,
    /// How long a socket may sit silent before it is closed.
    pub idle_timeout: Duration,
    /// The largest frame accepted, in bytes.
    pub max_frame: usize,
    /// How many messages one conversation keeps; the oldest are dropped.
    pub max_messages: usize,
    /// How many conversations the process remembers.
    pub max_conversations: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            auth_timeout: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(300),
            max_frame: 256 * 1024,
            max_messages: 40,
            max_conversations: 500,
        }
    }
}

/// The conversations this process remembers, for a client that reconnects with a `sessionId`.
#[derive(Debug)]
pub struct Conversations {
    inner: Mutex<Inner>,
}

#[derive(Debug, Default)]
struct Inner {
    /// Oldest first: the front is evicted when the map is full.
    order: VecDeque<String>,
    by_id: HashMap<String, Conversation>,
}

#[derive(Debug, Clone)]
struct Conversation {
    /// The key that created it. Another key's session id is not a session.
    key_id: String,
    assistant_id: String,
    messages: Vec<CompletionMessage>,
}

impl Conversations {
    /// An empty registry.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts a conversation for this key and agent.
    pub(super) fn create(
        &self,
        limits: &Limits,
        key_id: &str,
        assistant_id: &str,
    ) -> Option<String> {
        let id = secret::random_id().ok()?;
        let mut inner = self.inner.lock().ok()?;
        while inner.by_id.len() >= limits.max_conversations {
            let Some(oldest) = inner.order.pop_front() else {
                break;
            };
            inner.by_id.remove(&oldest);
        }
        inner.order.push_back(id.clone());
        inner.by_id.insert(
            id.clone(),
            Conversation {
                key_id: key_id.to_owned(),
                assistant_id: assistant_id.to_owned(),
                messages: Vec::new(),
            },
        );
        Some(id)
    }

    /// The conversation a client asked to resume, when it is this key's and this agent's.
    pub(super) fn resume(
        &self,
        key_id: &str,
        assistant_id: &str,
        id: &str,
    ) -> Option<Vec<CompletionMessage>> {
        let inner = self.inner.lock().ok()?;
        let conversation = inner.by_id.get(id)?;
        (conversation.key_id == key_id && conversation.assistant_id == assistant_id)
            .then(|| conversation.messages.clone())
    }

    /// Adds one message, dropping the oldest when the conversation is full.
    pub(super) fn append(&self, limits: &Limits, id: &str, message: CompletionMessage) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        let Some(conversation) = inner.by_id.get_mut(id) else {
            return;
        };
        conversation.messages.push(message);
        let excess = conversation
            .messages
            .len()
            .saturating_sub(limits.max_messages);
        if excess > 0 {
            conversation.messages.drain(..excess);
        }
    }

    /// The conversation as the model reads it.
    pub(super) fn messages(&self, id: &str) -> Vec<CompletionMessage> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.by_id.get(id).map(|c| c.messages.clone()))
            .unwrap_or_default()
    }
}

impl Default for Conversations {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_session_belongs_to_the_key_and_agent_that_made_it() {
        let conversations = Conversations::new();
        let limits = Limits::default();
        let Some(id) = conversations.create(&limits, "key-a", "agent-1") else {
            return;
        };
        assert!(conversations.resume("key-a", "agent-1", &id).is_some());
        assert!(conversations.resume("key-b", "agent-1", &id).is_none());
        assert!(conversations.resume("key-a", "agent-2", &id).is_none());
        assert!(conversations.resume("key-a", "agent-1", "nope").is_none());
    }

    #[test]
    fn a_conversation_drops_its_oldest_messages() {
        let conversations = Conversations::new();
        let limits = Limits {
            max_messages: 2,
            ..Limits::default()
        };
        let Some(id) = conversations.create(&limits, "key", "agent") else {
            return;
        };
        for content in ["one", "two", "three"] {
            conversations.append(
                &limits,
                &id,
                CompletionMessage {
                    role: "user".to_owned(),
                    content: content.to_owned(),
                },
            );
        }
        let messages: Vec<String> = conversations
            .messages(&id)
            .into_iter()
            .map(|message| message.content)
            .collect();
        assert_eq!(messages, vec!["two".to_owned(), "three".to_owned()]);
    }
}
