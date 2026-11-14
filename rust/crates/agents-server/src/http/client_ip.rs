//! The caller's IP address: the one place every route reads it from.
//!
//! The rule is `agents_core::net::client_ip`: the socket peer, unless the peer is one of
//! `TRUSTED_PROXIES`, and only then `X-Forwarded-For` walked from the right. The peer comes from
//! axum's `ConnectInfo`, which `main.rs` serves with; a test sets it by inserting
//! `ConnectInfo<SocketAddr>` into the request's extensions.

use std::convert::Infallible;
use std::net::{IpAddr, SocketAddr};

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::HeaderMap;
use axum::http::request::Parts;

use crate::AppState;

/// The caller's address, `None` when the server cannot know it (no socket peer: a test that
/// sets none, or an in-process call).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClientIp(pub Option<IpAddr>);

impl ClientIp {
    /// The address as text, for an audit row or an allowlist.
    #[must_use]
    pub fn text(self) -> Option<String> {
        self.0.map(|ip| ip.to_string())
    }

    /// The address as a throttle key: one bucket for every caller whose address is unknown.
    #[must_use]
    pub fn key(self) -> String {
        self.text().unwrap_or_else(|| "unknown".to_owned())
    }
}

/// The caller's address from the peer and the headers, under the state's trusted proxies.
#[must_use]
pub fn resolve(state: &AppState, peer: Option<SocketAddr>, headers: &HeaderMap) -> ClientIp {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    ClientIp(agents_core::net::client_ip(
        peer.map(|p| p.ip()),
        header("x-forwarded-for"),
        header("x-real-ip"),
        &state.trusted_proxies,
    ))
}

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ConnectInfo(addr)| *addr);
        Ok(resolve(state, peer, &parts.headers))
    }
}
