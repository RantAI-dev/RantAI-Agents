//! Authorisation: who may do what, in one pure function (docs/design/identity-and-access.md §3).
//!
//! Every check goes through [`authorize`]. Routes never compare roles themselves, and every list
//! query in `agents-store` filters by the same rule in SQL; `agents-store/tests/authz*.rs`
//! compares the two over a generated organisation.
//!
//! - Another organisation's resource is [`Decision::NotFound`], never [`Decision::Deny`], so a
//!   caller cannot learn that an id exists elsewhere.
//! - A grant or share to a unit reaches the members of that unit and of every unit below it,
//!   never the units above it.

mod tree;

#[cfg(test)]
mod tests;

use std::collections::BTreeSet;

pub use tree::{TreeError, UnitTree};

use crate::org::OrgRole;

/// The unit of enforcement. Roles are named sets of these (§3.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Permission {
    /// Rename or delete the organisation.
    OrgManage,
    /// Invite and remove members, set their role.
    OrgMembersManage,
    /// Departments, teams and their membership. A unit lead holds it inside their own subtree.
    OrgUnitsManage,
    /// Identity providers and group mappings.
    OrgSsoManage,
    OrgAuditRead,
    AgentsCreate,
    /// Edit, delete, bindings and access of an agent. A `manage` grant holds it for one agent.
    AgentsManage,
    /// Chat with an agent: only one granted to the caller (§3.3).
    AgentsUse,
    ApiKeysManage,
    ChatsShare,
    ChatsReadShared,
}

impl Permission {
    pub const ALL: [Self; 11] = [
        Self::OrgManage,
        Self::OrgMembersManage,
        Self::OrgUnitsManage,
        Self::OrgSsoManage,
        Self::OrgAuditRead,
        Self::AgentsCreate,
        Self::AgentsManage,
        Self::AgentsUse,
        Self::ApiKeysManage,
        Self::ChatsShare,
        Self::ChatsReadShared,
    ];

    /// The catalogue name, as audit rows and the API spell it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::OrgManage => "org.manage",
            Self::OrgMembersManage => "org.members.manage",
            Self::OrgUnitsManage => "org.units.manage",
            Self::OrgSsoManage => "org.sso.manage",
            Self::OrgAuditRead => "org.audit.read",
            Self::AgentsCreate => "agents.create",
            Self::AgentsManage => "agents.manage",
            Self::AgentsUse => "agents.use",
            Self::ApiKeysManage => "api_keys.manage",
            Self::ChatsShare => "chats.share",
            Self::ChatsReadShared => "chats.read_shared",
        }
    }
}

/// The role → permission table of §3.2. `member` does not build agents (differences row 80).
#[must_use]
pub const fn role_has(role: OrgRole, permission: Permission) -> bool {
    use Permission as P;
    match permission {
        P::OrgManage => matches!(role, OrgRole::Owner),
        P::OrgMembersManage
        | P::OrgUnitsManage
        | P::OrgSsoManage
        | P::OrgAuditRead
        | P::AgentsCreate
        | P::AgentsManage
        | P::ApiKeysManage => matches!(role, OrgRole::Owner | OrgRole::Admin),
        P::ChatsShare => matches!(role, OrgRole::Owner | OrgRole::Admin | OrgRole::Member),
        P::AgentsUse | P::ChatsReadShared => true,
    }
}

/// Every permission a role holds, in catalogue order.
#[must_use]
pub fn role_permissions(role: OrgRole) -> Vec<Permission> {
    Permission::ALL
        .into_iter()
        .filter(|p| role_has(role, *p))
        .collect()
}

/// An owner or admin: sees every agent of the org, shares and revokes any chat.
#[must_use]
pub const fn is_org_admin(role: OrgRole) -> bool {
    matches!(role, OrgRole::Owner | OrgRole::Admin)
}

/// The outcome of a check. The caller maps it: `Deny` to 403 `permission_denied`, `NotFound` to
/// 404 `not_found`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny,
    /// The resource belongs to another organisation.
    NotFound,
}

impl Decision {
    #[must_use]
    pub const fn is_allowed(self) -> bool {
        matches!(self, Self::Allow)
    }

    const fn from_bool(allowed: bool) -> Self {
        if allowed { Self::Allow } else { Self::Deny }
    }
}

/// What a grant or a share names: the whole org, a unit (and so everything below it), or a user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SubjectType {
    Org,
    Unit,
    User,
}

impl SubjectType {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "org" => Some(Self::Org),
            "unit" => Some(Self::Unit),
            "user" => Some(Self::User),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Org => "org",
            Self::Unit => "unit",
            Self::User => "user",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Subject {
    pub kind: SubjectType,
    /// The organisation, unit or user id.
    pub id: String,
}

/// How much an agent grant gives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum GrantLevel {
    Use,
    /// Use, plus edit this one agent (optional delegation; `agents.create` stays admin-only).
    Manage,
}

impl GrantLevel {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "use" => Some(Self::Use),
            "manage" => Some(Self::Manage),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Use => "use",
            Self::Manage => "manage",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grant {
    pub subject: Subject,
    pub level: GrantLevel,
}

/// What a unit is. Both nest to any depth; the kind is a label for people, not a rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnitKind {
    Department,
    Team,
}

impl UnitKind {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "department" => Some(Self::Department),
            "team" => Some(Self::Team),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Department => "department",
            Self::Team => "team",
        }
    }
}

/// Where a unit membership came from. `idp` rows are re-synced at every SSO login; `manual`
/// ones are left alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemberSource {
    Manual,
    Idp,
}

impl MemberSource {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "manual" => Some(Self::Manual),
            "idp" => Some(Self::Idp),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Idp => "idp",
        }
    }
}

/// One unit the user is in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnitMembership {
    pub unit_id: String,
    pub is_lead: bool,
}

/// The caller, as authorisation sees them, inside one organisation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Principal {
    pub user_id: String,
    pub organization_id: String,
    pub role: OrgRole,
    pub is_platform_admin: bool,
    pub units: Vec<UnitMembership>,
    /// The units a grant may name to reach this user: theirs and every unit above them.
    reach: BTreeSet<String>,
    /// The units this user leads, and everything below them.
    lead_scope: BTreeSet<String>,
}

impl Principal {
    /// Resolves the user's units against the org's tree. A membership of a unit the tree does
    /// not hold is ignored: it is not this organisation's.
    #[must_use]
    pub fn new(
        user_id: impl Into<String>,
        organization_id: impl Into<String>,
        role: OrgRole,
        is_platform_admin: bool,
        units: Vec<UnitMembership>,
        tree: &UnitTree,
    ) -> Self {
        let mut reach = BTreeSet::new();
        let mut lead_scope = BTreeSet::new();
        for m in units.iter().filter(|m| tree.contains(&m.unit_id)) {
            reach.insert(m.unit_id.clone());
            reach.extend(tree.ancestors(&m.unit_id));
            if m.is_lead {
                lead_scope.insert(m.unit_id.clone());
                lead_scope.extend(tree.descendants(&m.unit_id));
            }
        }
        Self {
            user_id: user_id.into(),
            organization_id: organization_id.into(),
            role,
            is_platform_admin,
            units,
            reach,
            lead_scope,
        }
    }

    /// The units whose grants and shares reach this user.
    #[must_use]
    pub const fn reach(&self) -> &BTreeSet<String> {
        &self.reach
    }

    /// Whether a grant or share naming `subject` reaches this user.
    #[must_use]
    pub fn matches(&self, subject: &Subject) -> bool {
        match subject.kind {
            SubjectType::Org => subject.id == self.organization_id,
            SubjectType::Unit => self.reach.contains(&subject.id),
            SubjectType::User => subject.id == self.user_id,
        }
    }

    fn owns(&self, organization_id: &str) -> bool {
        self.organization_id == organization_id
    }
}

/// An agent, reduced to what the access rule sees. `grants` are the grants stored in the
/// agent's own organisation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentRef {
    /// `None` for a global (built-in or org-less) agent.
    pub organization_id: Option<String>,
    pub is_built_in: bool,
    pub grants: Vec<Grant>,
}

/// A chat session, reduced to what the sharing rule sees. `shares` are the active (not revoked)
/// shares stored in the session's own organisation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatRef {
    pub organization_id: String,
    pub owner_id: String,
    pub shares: Vec<Subject>,
}

/// What the action is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resource<'a> {
    /// The organisation itself: settings, members, SSO, audit, creating agents or top-level units.
    Org {
        organization_id: &'a str,
    },
    /// One unit, for `org.units.manage` inside a lead's subtree: editing it, its members, or
    /// creating a child under it.
    Unit {
        organization_id: &'a str,
        unit_id: &'a str,
    },
    Agent(&'a AgentRef),
    Chat(&'a ChatRef),
}

/// The one authorisation decision.
#[must_use]
pub fn authorize(
    principal: &Principal,
    permission: Permission,
    resource: &Resource<'_>,
) -> Decision {
    match resource {
        Resource::Org { organization_id } => {
            if !principal.owns(organization_id) {
                return Decision::NotFound;
            }
            Decision::from_bool(role_has(principal.role, permission))
        }
        Resource::Unit {
            organization_id,
            unit_id,
        } => {
            if !principal.owns(organization_id) {
                return Decision::NotFound;
            }
            let allowed = role_has(principal.role, permission)
                || (permission == Permission::OrgUnitsManage
                    && can_lead_manage_unit(principal, unit_id));
            Decision::from_bool(allowed)
        }
        Resource::Agent(agent) => match &agent.organization_id {
            Some(org) if !principal.owns(org) => Decision::NotFound,
            _ => Decision::from_bool(match permission {
                Permission::AgentsUse => can_use_agent(principal, agent),
                Permission::AgentsManage => can_manage_agent(principal, agent),
                other => agent.organization_id.is_some() && role_has(principal.role, other),
            }),
        },
        Resource::Chat(chat) => {
            if !principal.owns(&chat.organization_id) {
                return Decision::NotFound;
            }
            Decision::from_bool(match permission {
                Permission::ChatsReadShared => can_read_chat(principal, chat),
                Permission::ChatsShare => can_share_chat(principal, chat),
                _ => false,
            })
        }
    }
}

/// §3.3: built-ins are visible to everyone; an org agent to its owners and admins, and to whoever
/// a grant reaches, directly, through a unit they are in or below, or through the org.
/// The caller has already checked that the agent is not another organisation's.
#[must_use]
pub fn can_use_agent(principal: &Principal, agent: &AgentRef) -> bool {
    if agent.is_built_in {
        return true;
    }
    // An org-less agent that is not built in belongs to no tenant; nobody is granted it.
    if agent.organization_id.is_none() {
        return false;
    }
    is_org_admin(principal.role) || agent.grants.iter().any(|g| principal.matches(&g.subject))
}

/// Editing one agent: built-ins only by a platform admin; an org agent by a holder of
/// `agents.manage`, or by whoever a `manage` grant reaches.
#[must_use]
pub fn can_manage_agent(principal: &Principal, agent: &AgentRef) -> bool {
    if agent.is_built_in {
        return principal.is_platform_admin;
    }
    if agent.organization_id.is_none() {
        return false;
    }
    role_has(principal.role, Permission::AgentsManage)
        || agent
            .grants
            .iter()
            .any(|g| g.level == GrantLevel::Manage && principal.matches(&g.subject))
}

/// §3.4: the owner reads their own chat; anyone else needs `chats.read_shared` and an active share
/// that reaches them. Being an admin does not open another user's chat.
#[must_use]
pub fn can_read_chat(principal: &Principal, chat: &ChatRef) -> bool {
    chat.owner_id == principal.user_id
        || (role_has(principal.role, Permission::ChatsReadShared)
            && chat.shares.iter().any(|s| principal.matches(s)))
}

/// §3.4: the owner (if their role may share), or an admin, shares and revokes.
#[must_use]
pub fn can_share_chat(principal: &Principal, chat: &ChatRef) -> bool {
    is_org_admin(principal.role)
        || (chat.owner_id == principal.user_id && role_has(principal.role, Permission::ChatsShare))
}

/// §3.2: a lead manages their own unit and everything below it, never above or beside it, and
/// never the top level.
#[must_use]
pub fn can_lead_manage_unit(principal: &Principal, unit_id: &str) -> bool {
    principal.lead_scope.contains(unit_id)
}
