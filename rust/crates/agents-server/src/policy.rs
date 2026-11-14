//! What the platform may refuse: the hook the cloud edition fills in.
//!
//! The open-source edition has no plans and no model catalogue, so it allows everything
//! ([`AllowAll`]). The cloud edition replaces it with a policy that refuses what the
//! organisation's plan does not include: the plan cap on the number of assistants, and the
//! models the plan may use. The hook runs before the write, so a refused request leaves no row
//! behind.
//!
//! The trait lives here, in the composition root, because it is the caller's business: the
//! cloud crate implements it and passes it to [`crate::AppState`].

use agents_core::org::OrgRole;

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
/// caller's role or plan does not allow it, a 402 `payment_required` when the plan has to be
/// paid for first.
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
