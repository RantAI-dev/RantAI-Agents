//! `Set-Cookie` values, written the way Auth.js's vendored `cookie.serialize` writes them:
//! `Max-Age`, `Path`, `Expires`, `HttpOnly`, `Secure`, `SameSite`, in that order.

use agents_auth::session::{SECURE_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME};
use agents_auth::session_issue::{SESSION_MAX_AGE_SECONDS, chunk_cookie};
use axum::http::HeaderMap;

/// The flow cookie between `start` and `callback`. `__Host-` when secure: no `Domain`, path `/`,
/// so no sibling subdomain can plant one.
pub const FLOW_COOKIE_NAME: &str = "rantai.sso-flow";
const SECURE_FLOW_COOKIE_NAME: &str = "__Host-rantai.sso-flow";

#[must_use]
pub const fn flow_cookie_name(secure: bool) -> &'static str {
    if secure {
        SECURE_FLOW_COOKIE_NAME
    } else {
        FLOW_COOKIE_NAME
    }
}

/// `toUTCString()`: `Thu, 01 Jan 2026 00:00:00 GMT`.
fn http_date(unix: i64) -> String {
    chrono::DateTime::from_timestamp(unix, 0)
        .unwrap_or_default()
        .format("%a, %d %b %Y %H:%M:%S GMT")
        .to_string()
}

fn attributes(max_age: Option<i64>, expires: Option<i64>, secure: bool) -> String {
    let mut out = String::new();
    if let Some(age) = max_age {
        out.push_str(&format!("; Max-Age={age}"));
    }
    out.push_str("; Path=/");
    if let Some(at) = expires {
        out.push_str(&format!("; Expires={}", http_date(at)));
    }
    out.push_str("; HttpOnly");
    if secure {
        out.push_str("; Secure");
    }
    out.push_str("; SameSite=Lax");
    out
}

/// The session cookies for `token`, chunked as Auth.js chunks them, expiring with the session.
#[must_use]
pub fn session_cookies(name: &str, token: &str, secure: bool, now_unix: i64) -> Vec<String> {
    let expires = now_unix.saturating_add(SESSION_MAX_AGE_SECONDS);
    chunk_cookie(name, token)
        .into_iter()
        .map(|(n, v)| format!("{n}={v}{}", attributes(None, Some(expires), secure)))
        .collect()
}

/// Cookies that remove every session cookie the request carries (any name, any chunk), plus the
/// unchunked cookie of this deployment's name, the way `SessionStore.clean` writes them.
#[must_use]
pub fn clear_session_cookies(request: &HeaderMap, secure: bool) -> Vec<String> {
    let mut names: Vec<String> = request
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|h| h.split(';'))
        .filter_map(|pair| pair.split_once('=').map(|(n, _)| n.trim().to_owned()))
        .filter(|n| is_session_cookie(n))
        .collect();
    let own = agents_auth::session_issue::session_cookie_name(secure).to_owned();
    if !names.contains(&own) {
        names.push(own);
    }
    names.dedup();
    names
        .into_iter()
        .map(|n| {
            // A `__Secure-` cookie can only be set, and so only removed, with `Secure`.
            let secure = secure || n.starts_with("__Secure-");
            format!("{n}={}", attributes(Some(0), None, secure))
        })
        .collect()
}

fn is_session_cookie(name: &str) -> bool {
    [SESSION_COOKIE_NAME, SECURE_SESSION_COOKIE_NAME]
        .iter()
        .any(|base| name == *base || name.strip_prefix(base).is_some_and(|r| r.starts_with('.')))
}

/// The flow cookie: ten minutes, `Lax` so the IdP's redirect back (a top-level GET) carries it.
#[must_use]
pub fn flow_cookie(value: &str, secure: bool, max_age: i64) -> String {
    format!(
        "{}={value}{}",
        flow_cookie_name(secure),
        attributes(Some(max_age), None, secure)
    )
}

/// Removes the flow cookie once the callback has used it.
#[must_use]
pub fn clear_flow_cookie(secure: bool) -> String {
    format!(
        "{}={}",
        flow_cookie_name(secure),
        attributes(Some(0), None, secure)
    )
}

/// A cookie's value from the request.
#[must_use]
pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|h| h.split(';'))
        .find_map(|pair| {
            let (k, v) = pair.trim().split_once('=')?;
            (k == name && !v.is_empty()).then(|| v.to_owned())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_session_cookie_has_the_auth_js_attributes() {
        let set = session_cookies("__Secure-authjs.session-token", "tok", true, 0);
        assert_eq!(
            set,
            [
                "__Secure-authjs.session-token=tok; Path=/; Expires=Sat, 31 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
            ]
        );
    }

    #[test]
    fn clearing_removes_every_chunk_the_request_has() {
        let mut h = HeaderMap::new();
        h.insert(
            axum::http::header::COOKIE,
            axum::http::HeaderValue::from_static(
                "authjs.session-token.0=a; authjs.session-token.1=b; other=c",
            ),
        );
        let cleared = clear_session_cookies(&h, false);
        assert_eq!(cleared.len(), 3);
        assert!(cleared.iter().all(|c| c.contains("Max-Age=0")));
        assert!(!cleared.iter().any(|c| c.starts_with("other=")));
    }
}
