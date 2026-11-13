//! Verifies the credentials Next.js issues, so Rust routes accept the same callers: the
//! NextAuth v5 session cookie, the mobile Bearer JWT, widget keys and `rantai_sk_` API keys.
//!
//! Pure: no database, no clock, no network. The caller passes the secret and the current
//! time in, and does the database lookups itself.

pub mod api_key;
pub mod base64url;
pub mod jwe;
pub mod mobile;
pub mod session;
pub mod widget;

use agents_contracts::error_codes::ErrorCode;

/// Who is calling. The ids each variant carries are what a route needs to scope its work.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Principal {
    /// A browser session, from the NextAuth cookie.
    SessionUser(session::SessionClaims),
    /// A mobile client, from the Bearer JWT.
    MobileUser(mobile::MobileClaims),
    /// An agent API key, after the database lookup that found it.
    ApiKey {
        /// The id of the key row.
        key_id: String,
        /// The assistant the key is bound to.
        assistant_id: String,
    },
    /// A widget embed key, after the database lookup that found it.
    WidgetKey {
        /// The id of the key row.
        key_id: String,
        /// The assistant the key is bound to.
        assistant_id: String,
    },
}

impl Principal {
    /// The user this call acts as, when it acts as one.
    #[must_use]
    pub fn user_id(&self) -> Option<&str> {
        match self {
            Self::SessionUser(claims) => Some(&claims.id),
            Self::MobileUser(claims) => Some(&claims.user_id),
            Self::ApiKey { .. } | Self::WidgetKey { .. } => None,
        }
    }

    /// The role of the user this call acts as, when it acts as one.
    #[must_use]
    pub fn role(&self) -> Option<&str> {
        match self {
            Self::SessionUser(claims) => claims.role.as_deref(),
            Self::MobileUser(claims) => claims.role.as_deref(),
            Self::ApiKey { .. } | Self::WidgetKey { .. } => None,
        }
    }

    /// The assistant this call is bound to, for the key principals.
    #[must_use]
    pub fn assistant_id(&self) -> Option<&str> {
        match self {
            Self::ApiKey { assistant_id, .. } | Self::WidgetKey { assistant_id, .. } => {
                Some(assistant_id)
            }
            Self::SessionUser(_) | Self::MobileUser(_) => None,
        }
    }
}

/// Why a credential was refused. Nothing here carries the secret or the token: a failure is
/// logged by the caller with the request id, never with the credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum AuthError {
    /// No credential was presented at all.
    #[error("no credential was presented")]
    Missing,
    /// The credential is malformed, or its signature does not verify.
    #[error("the credential is not valid")]
    Invalid,
    /// The credential is well formed but past its expiry.
    #[error("the credential has expired")]
    Expired,
    /// The key is valid, but the caller's address is not on its whitelist. The old route
    /// answers this with a 403, not a 401.
    #[error("the request address is not allowed for this key")]
    IpNotAllowed,
}

impl AuthError {
    /// The code the response carries.
    #[must_use]
    pub const fn code(self) -> ErrorCode {
        match self {
            Self::Missing | Self::Invalid | Self::Expired => ErrorCode::Unauthenticated,
            Self::IpNotAllowed => ErrorCode::PermissionDenied,
        }
    }
}
