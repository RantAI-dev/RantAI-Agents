//! Sign-in in Rust (docs/design/identity-and-access.md §3.5, slice S2): password and mobile
//! sign-in, sign-out, OIDC single sign-on, and the identity-provider admin API. The session it
//! issues is the NextAuth v5 cookie, so the pages Next.js still serves accept it unchanged.

mod password;
mod providers;
mod sso;

use axum::Router;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(password::router())
        .merge(sso::router())
        .merge(providers::router())
}
