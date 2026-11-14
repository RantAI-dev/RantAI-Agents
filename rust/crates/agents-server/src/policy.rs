//! What the platform may refuse: the hook the cloud edition fills in.
//!
//! The open-source edition has no plans and no model catalogue, so it allows everything
//! ([`AllowAll`]). The cloud edition replaces it with a policy that refuses what the
//! organisation's plan does not include: the plan cap on the number of assistants, and the
//! models the plan may use. The hook runs before the write, so a refused request leaves no row
//! behind.
//!
//! The same goes for a chat: the model policy, the usage and the credits belong to the cloud
//! edition, so [`ChatMeter`] is the hook it fills in. The open-source edition allows every chat
//! and records nothing ([`AllowAllChat`]).
//!
//! The traits live here, in the composition root, because it is the caller's business: the
//! cloud crate implements them and passes them to [`crate::AppState`].

use agents_core::org::OrgRole;
use agents_llm::types::Usage;

use crate::http::ApiError;

/// What the request wants to do to an assistant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAction {
    Create,
    Update,
}

/// What the policy gets to look at.
#[derive(Debug, Clone, Copy)]
pub struct PolicyContext<'a> {
    /// Who is asking.
    pub user_id: &'a str,
    /// The organisation the assistant belongs to. `None` for a built-in assistant, which
    /// belongs to no organisation.
    pub organization_id: Option<&'a str>,
    /// The caller's role in that organisation.
    pub role: OrgRole,
    /// What the request does.
    pub action: PolicyAction,
    /// The name the assistant has (or would have).
    pub name: &'a str,
    /// The model the assistant uses, when the request sets one.
    pub model: Option<&'a str>,
    /// How many assistants the organisation has. A plan cap counts them.
    pub assistant_count: usize,
}

/// The plan limits and the model policy of a deployment.
///
/// Both hooks answer with the error the caller must see: a 403 `permission_denied` when the
/// caller's role or plan does not allow it, including when the plan has to be paid for first
/// (docs/conventions.md does not use 402).
pub trait AssistantPolicy: Send + Sync + std::fmt::Debug {
    /// Called before an assistant is created.
    fn check_create(&self, ctx: &PolicyContext<'_>) -> Result<(), ApiError>;

    /// Called before an assistant is updated.
    fn check_update(&self, ctx: &PolicyContext<'_>) -> Result<(), ApiError>;
}

/// The open-source policy: nothing is refused.
#[derive(Debug, Clone, Copy, Default)]
pub struct AllowAll;

impl AssistantPolicy for AllowAll {
    fn check_create(&self, _ctx: &PolicyContext<'_>) -> Result<(), ApiError> {
        Ok(())
    }

    fn check_update(&self, _ctx: &PolicyContext<'_>) -> Result<(), ApiError> {
        Ok(())
    }
}

/// What the meter gets to look at.
#[derive(Debug, Clone, Copy)]
pub struct ChatContext<'a> {
    /// Who is asking.
    pub user_id: &'a str,
    /// The organisation the chat happens in, when it has one.
    pub organization_id: Option<&'a str>,
    /// The assistant the chat is with.
    pub assistant_id: Option<&'a str>,
    /// The model the chat will use.
    pub model: &'a str,
}

/// What a chat may cost: the model policy, the usage and the credits.
///
/// The open-source edition has none of the three, so the default allows every chat and records
/// nothing. The cloud edition refuses a chat its plan does not pay for before the model is
/// called, and deducts the credits afterwards.
pub trait ChatMeter: Send + Sync + std::fmt::Debug {
    /// Called before the model is called.
    ///
    /// A refusal is a 403 `permission_denied` (docs/conventions.md does not use 402).
    fn check(&self, ctx: &ChatContext<'_>) -> Result<(), ApiError>;

    /// Called after the answer, with what the model reported it cost.
    fn record(&self, ctx: &ChatContext<'_>, usage: Usage);
}

/// The open-source meter: nothing is refused and nothing is recorded.
#[derive(Debug, Clone, Copy, Default)]
pub struct AllowAllChat;

impl ChatMeter for AllowAllChat {
    fn check(&self, _ctx: &ChatContext<'_>) -> Result<(), ApiError> {
        Ok(())
    }

    fn record(&self, _ctx: &ChatContext<'_>, _usage: Usage) {}
}
