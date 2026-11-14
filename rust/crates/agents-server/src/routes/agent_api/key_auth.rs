//! Authenticating a caller that presents an agent API key (`Authorization: Bearer rantai_sk_…`).
//!
//! Old: `authenticateV1Request` in `src/features/agent-api/service.ts` and
//! `authenticateAgentApiKey` in `src/features/agent-api-keys/service.ts`, with the checks in
//! the same order: the key by its hash, then `enabled`, then `expiresAt`, then the IP
//! allowlist, then the scope. The route looks the key up by `hex(SHA-256(key))`, which is what
//! `agents_auth::api_key` builds.
//!
//! The key acts as its agent in the agent's organisation, not as a user: there is no
//! `CurrentUser` here, and no session. Every refusal that means "this credential does not open
//! this door" is a 401; a key that is valid but comes from an address its allowlist does not
//! name, or that lacks the scope the call needs, is a 403.

use axum::http::HeaderMap;

use agents_auth::api_key::{hash_agent_api_key, ip_allowed};
use agents_contracts::error_codes::ErrorCode;
use agents_store::api_keys::{self, ApiKeyRow};
use agents_store::assistants::{self, AssistantRow};

use crate::AppState;
use crate::http::ApiError;

/// What the call needs the key to be allowed to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    /// A non-streaming completion.
    Chat,
    /// A streaming completion, and the WebSocket, which is always streaming.
    ChatStream,
}

impl Scope {
    /// The scope a key must carry, as the old route named it.
    const fn name(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::ChatStream => "chat:stream",
        }
    }

    /// Whether a key with these scopes may make the call.
    ///
    /// The old rule, kept: an empty list allows everything, `chat` alone allows streaming too,
    /// and anything else has to name the scope the call needs.
    fn allows(self, scopes: &[String]) -> bool {
        scopes.is_empty()
            || scopes.iter().any(|scope| scope == self.name())
            || scopes.iter().any(|scope| scope == "chat")
    }
}

/// An authenticated caller: the key, and the agent it acts as.
#[derive(Debug, Clone)]
pub struct KeyCaller {
    pub key: ApiKeyRow,
    pub assistant: AssistantRow,
}

impl KeyCaller {
    /// The organisation the key belongs to. A key is minted inside one, so a row with none is
    /// one the TypeScript wrote before organisations were required, and it reaches no agent.
    pub fn org_id(&self) -> Option<&str> {
        self.key.organization_id.as_deref()
    }

    /// The identity the tools and the meter see: the key, not a person.
    pub fn synthetic_user_id(&self) -> String {
        format!("api_key_{}", self.key.id)
    }
}

/// The key a request carries, when it carries one.
#[must_use]
pub fn presented(headers: &HeaderMap) -> Option<&str> {
    let value = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .trim();
    let token = value.strip_prefix("Bearer ")?.trim();
    (!token.is_empty()).then_some(token)
}

/// The caller, or the answer the request gets.
///
/// `ip` is the caller's address as `http::client_ip::ClientIp` gives it (the socket peer, or a
/// hop a trusted proxy vouches for); `None` means the server cannot know it, which a non-empty
/// allowlist refuses rather than guesses.
pub async fn authenticate(
    state: &AppState,
    presented_key: &str,
    scope: Scope,
    ip: Option<&str>,
) -> Result<KeyCaller, ApiError> {
    let row = lookup(state, presented_key).await?;
    let row = check_key(row, scope, ip)?;
    let assistant = assistants::get(&state.db, &row.assistant_id)
        .await
        .map_err(|error| match error {
            agents_store::StoreError::NotFound => invalid(),
            other => {
                tracing::error!(error = %other, "the key's agent could not be read");
                ApiError::new(ErrorCode::Internal)
            }
        })?;
    Ok(KeyCaller {
        key: row,
        assistant,
    })
}

/// The key row a presented value hashes to, or a 401.
async fn lookup(state: &AppState, presented_key: &str) -> Result<ApiKeyRow, ApiError> {
    let hash = hash_agent_api_key(presented_key);
    let row = api_keys::find_by_hash(&state.db, &hash)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "the API key could not be read");
            ApiError::new(ErrorCode::Internal)
        })?
        .ok_or_else(invalid)?;
    Ok(row)
}

/// `enabled`, `expiresAt`, the IP allowlist and the scope, in the order the old code checked
/// them, so one request cannot be used to learn which check refused the other.
fn check_key(row: ApiKeyRow, scope: Scope, ip: Option<&str>) -> Result<ApiKeyRow, ApiError> {
    if !row.enabled {
        return Err(invalid());
    }
    let expired = row
        .expires_at
        .is_some_and(|expires| expires < chrono::Utc::now().naive_utc());
    if expired {
        return Err(invalid());
    }
    if !ip_allowed(&row.ip_whitelist, ip) {
        return Err(ApiError::new(ErrorCode::PermissionDenied).message("IP address not allowed"));
    }
    if !scope.allows(&row.scopes) {
        return Err(ApiError::new(ErrorCode::PermissionDenied)
            .message(format!("API key does not have scope: {}", scope.name())));
    }
    Ok(row)
}

/// The 401 every unrecognised, disabled or expired key gets: one answer, so the caller cannot
/// tell a key that never existed from one that was switched off.
fn invalid() -> ApiError {
    ApiError::new(ErrorCode::Unauthenticated).message("Invalid or expired API key")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scopes(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_owned()).collect()
    }

    #[test]
    fn the_scope_rule_is_the_old_one() {
        assert!(Scope::ChatStream.allows(&[]));
        assert!(Scope::Chat.allows(&[]));
        assert!(Scope::Chat.allows(&scopes(&["chat"])));
        assert!(Scope::ChatStream.allows(&scopes(&["chat"])));
        assert!(Scope::ChatStream.allows(&scopes(&["chat:stream"])));
        assert!(!Scope::ChatStream.allows(&scopes(&["other"])));
        assert!(!Scope::Chat.allows(&scopes(&["chat:stream"])));
    }
}
