//! Organisation roles and what each may do, from `canEdit` / `canManage` in
//! `src/lib/org-context.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrgRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl OrgRole {
    /// The stored spelling. Anything else is not a role (the TypeScript treated it as no access).
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(Self::Owner),
            "admin" => Some(Self::Admin),
            "member" => Some(Self::Member),
            "viewer" => Some(Self::Viewer),
            _ => None,
        }
    }

    /// Create and change the organisation's resources.
    #[must_use]
    pub const fn can_edit(self) -> bool {
        matches!(self, Self::Owner | Self::Admin | Self::Member)
    }

    /// Delete resources and change organisation-wide settings.
    #[must_use]
    pub const fn can_manage(self) -> bool {
        matches!(self, Self::Owner | Self::Admin)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles() {
        assert_eq!(OrgRole::parse("viewer"), Some(OrgRole::Viewer));
        assert_eq!(OrgRole::parse("Owner"), None);
        assert!(OrgRole::Member.can_edit() && !OrgRole::Member.can_manage());
        assert!(!OrgRole::Viewer.can_edit());
        assert!(OrgRole::Admin.can_manage());
    }
}
