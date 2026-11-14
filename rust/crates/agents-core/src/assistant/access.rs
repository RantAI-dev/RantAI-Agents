//! Who may do what to an assistant: the access policy as a pure function.
//!
//! The checks come from `src/features/assistants/core/service.ts`,
//! `bindings/service.ts` (`requireAssistantAccess`) and the default-mutation guard, with
//! the deliberate changes from `docs/port/differences.md` applied: built-in assistants are
//! read-only for everyone except a platform admin, editing bindings needs the same role as
//! editing the assistant, and setting the system default needs `canManage`.
//!
//! The Rust version answers one question — [`can`] — instead of the old HTTP statuses:
//! `false` covers both "hidden from you" (the old 404, to avoid leaking existence) and
//! "not your role" (the old 403); the caller picks the response it sends.
//!
//! The role checks come from [`crate::authz`]'s role table. Two rules of the identity-and-access
//! design wait for slice S4, because `tests/parity_assistants.rs` (owner-protected) pins the old
//! answers: `View` is still "in your org" rather than "granted to you", and `Edit` still lets a
//! `member` edit (differences row 80). S4 moves its routes to [`crate::authz::authorize`].

use crate::authz::{Permission, role_has};
use crate::org::OrgRole;

/// The authenticated caller. The user id is carried for the callers' audit trails; the
/// decision itself only needs the organisation, the role and the platform-admin flag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Actor {
    /// Carried for the callers' audit trails; the decision itself does not need it.
    pub user_id: String,
    /// The caller's active organisation, when they have one.
    pub organization_id: Option<String>,
    /// The caller's role in that organisation.
    pub role: Option<OrgRole>,
    pub is_platform_admin: bool,
}

/// What the caller wants to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    View,
    Edit,
    Delete,
    EditBindings,
    SetDefault,
}

/// The assistant the action is about, reduced to what the policy sees.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssistantRef {
    /// `None` for global (built-in or org-less) assistants.
    pub organization_id: Option<String>,
    pub is_built_in: bool,
}

impl Actor {
    /// Whether the target is visible to the caller: global, or in the caller's org.
    fn can_see(&self, target: &AssistantRef) -> bool {
        target.is_built_in
            || target.organization_id.is_none()
            || self.organization_id.as_ref() == target.organization_id.as_ref()
    }
}

/// The one access decision: is `actor` allowed `action` on `target`?
#[must_use]
pub fn can(actor: &Actor, action: Action, target: &AssistantRef) -> bool {
    match action {
        // Built-in and org-less assistants are visible to everyone; an org-scoped one
        // only to its own org (the old code answered 404, not 403, on a cross-org view).
        Action::View => actor.can_see(target),
        // Built-ins are read-only for everyone except a platform admin (differences row 25).
        // An org-scoped assistant needs the caller's own org plus a role that may edit;
        // an org-less non-built-in one stayed editable by anyone logged in.
        Action::Edit | Action::EditBindings => {
            if target.is_built_in {
                actor.is_platform_admin
            } else {
                match &target.organization_id {
                    None => true,
                    Some(organization_id) => {
                        actor.organization_id.as_ref() == Some(organization_id)
                            && actor.role.is_some_and(OrgRole::can_edit)
                    }
                }
            }
        }
        // Built-ins cannot be deleted at all; an org-scoped one needs a manager of its
        // own org; an org-less one, anyone logged in (as before).
        Action::Delete => {
            !target.is_built_in
                && match &target.organization_id {
                    None => true,
                    Some(organization_id) => {
                        actor.organization_id.as_ref() == Some(organization_id)
                            && actor
                                .role
                                .is_some_and(|r| role_has(r, Permission::AgentsManage))
                    }
                }
        }
        // Setting the default needs a manager of the target's own org. The default is kept per
        // organisation on the assistant row, so a built-in or org-less assistant cannot be one;
        // with no org default the built-in default applies (differences row 27).
        Action::SetDefault => {
            !target.is_built_in
                && target.organization_id.is_some()
                && actor.organization_id == target.organization_id
                && actor
                    .role
                    .is_some_and(|r| role_has(r, Permission::AgentsManage))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actor(organization: Option<&str>, role: Option<OrgRole>, platform: bool) -> Actor {
        Actor {
            user_id: "user_oracle".to_owned(),
            organization_id: organization.map(str::to_owned),
            role,
            is_platform_admin: platform,
        }
    }

    fn target(organization: Option<&str>, built_in: bool) -> AssistantRef {
        AssistantRef {
            organization_id: organization.map(str::to_owned),
            is_built_in: built_in,
        }
    }

    #[test]
    fn built_ins_are_read_only_except_for_a_platform_admin() {
        let member = actor(Some("org_a"), Some(OrgRole::Member), false);
        let admin = actor(Some("org_a"), Some(OrgRole::Admin), true);
        let built_in = target(None, true);
        assert!(can(&member, Action::View, &built_in));
        assert!(!can(&member, Action::Edit, &built_in));
        assert!(!can(&member, Action::EditBindings, &built_in));
        assert!(!can(&member, Action::Delete, &built_in));
        assert!(can(&admin, Action::Edit, &built_in));
        assert!(!can(&admin, Action::Delete, &built_in));
    }

    #[test]
    fn org_assistants_need_the_callers_own_org() {
        let member = actor(Some("org_a"), Some(OrgRole::Member), false);
        let owner = actor(Some("org_a"), Some(OrgRole::Owner), false);
        let org_a = target(Some("org_a"), false);
        let org_b = target(Some("org_b"), false);
        assert!(can(&member, Action::View, &org_a));
        assert!(!can(&member, Action::View, &org_b));
        assert!(can(&member, Action::Edit, &org_a));
        assert!(!can(&member, Action::Edit, &org_b));
        // Deleting needs a manager (the old code returned 403 for a member).
        assert!(!can(&member, Action::Delete, &org_a));
        assert!(can(&owner, Action::Delete, &org_a));
        assert!(!can(&owner, Action::Delete, &org_b));
    }

    #[test]
    fn bindings_need_the_same_role_as_editing() {
        let viewer = actor(Some("org_a"), Some(OrgRole::Viewer), false);
        let member = actor(Some("org_a"), Some(OrgRole::Member), false);
        let org_a = target(Some("org_a"), false);
        assert!(!can(&viewer, Action::EditBindings, &org_a));
        assert!(can(&member, Action::EditBindings, &org_a));
    }

    #[test]
    fn the_default_needs_can_manage() {
        let member = actor(Some("org_a"), Some(OrgRole::Member), false);
        let admin = actor(Some("org_a"), Some(OrgRole::Admin), false);
        let org_a = target(Some("org_a"), false);
        assert!(!can(&member, Action::SetDefault, &org_a));
        assert!(can(&admin, Action::SetDefault, &org_a));
        // Only an assistant of the caller's own org can be its default.
        assert!(!can(&admin, Action::SetDefault, &target(None, true)));
        assert!(!can(&admin, Action::SetDefault, &target(None, false)));
        assert!(!can(
            &admin,
            Action::SetDefault,
            &target(Some("org_b"), false)
        ));
    }
}
