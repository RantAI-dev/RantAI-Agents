//! The NextAuth v5 session cookie.
//!
//! The cookie holds a JWE (`dir` + `A256CBC-HS512`) whose key is HKDF-SHA256 over
//! `NEXTAUTH_SECRET`, salted with the *cookie name*. The claims the app relies on are `id`
//! (the user id, set by the `jwt` callback) and `role`; `sub` is the same user id.
//!
//! Reference: `src/lib/auth.ts` (the NextAuth config) and `@auth/core/jwt`.

use serde::{Deserialize, Serialize};

use crate::AuthError;
use crate::jwe;

/// The cookie name in a plain HTTP deployment.
pub const SESSION_COOKIE_NAME: &str = "authjs.session-token";
/// The cookie name when the deployment is served over HTTPS.
pub const SECURE_SESSION_COOKIE_NAME: &str = "__Secure-authjs.session-token";
/// Auth.js accepts a token for 15 seconds past its expiry (`clockTolerance: 15` in
/// `@auth/core/jwt`).
pub const CLOCK_TOLERANCE_SECONDS: i64 = 15;

/// What the session says about the caller. The field names are the ones the old
/// `session.user` object had.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionClaims {
    /// `session.user.id`: the user id. The old app treats a session without it as signed out.
    pub id: String,
    /// `session.user.role`, `USER` or `ADMIN`.
    pub role: Option<String>,
    /// `session.user.email`.
    pub email: Option<String>,
    /// `session.user.name`.
    pub name: Option<String>,
    /// The `sub` claim: the user id as Auth.js sets it.
    pub sub: Option<String>,
    /// `iat`: when the token was issued.
    pub issued_at: Option<i64>,
    /// `exp`: when the token expires.
    pub expires_at: i64,
}

/// The session cookie found in a `Cookie` header, with the name it was issued under. The name
/// matters: it is the salt the key was derived with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionCookie {
    /// The cookie name, without a chunk suffix.
    pub name: String,
    /// The cookie value, with the chunks joined.
    pub value: String,
}

#[derive(Deserialize)]
struct RawClaims {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    sub: Option<String>,
    #[serde(default)]
    iat: Option<i64>,
    #[serde(default)]
    exp: Option<i64>,
}

/// Decode a session cookie value.
///
/// `cookie_name` is the name the cookie was issued under (`authjs.session-token` or
/// `__Secure-authjs.session-token`): it is the salt the key was derived with, so a token
/// decoded under the wrong name does not verify.
pub fn decode_session_cookie(
    token: &str,
    secret: &str,
    cookie_name: &str,
    now_unix: i64,
) -> Result<SessionClaims, AuthError> {
    decode_session_cookie_with_secrets(token, &[secret], cookie_name, now_unix)
}

/// Decode a session cookie value, trying each secret in turn.
///
/// Auth.js accepts a list of secrets so a deployment can rotate one: the token carries the
/// thumbprint of the key it was issued with, and only the secret that produces that thumbprint
/// is used.
pub fn decode_session_cookie_with_secrets(
    token: &str,
    secrets: &[&str],
    cookie_name: &str,
    now_unix: i64,
) -> Result<SessionClaims, AuthError> {
    let header = jwe::protected_header(token)?;
    if header.alg != jwe::ALG_DIR || header.enc != jwe::ENC_A256CBC_HS512 {
        return Err(AuthError::Invalid);
    }
    let cek = matching_cek(&header, secrets, cookie_name).ok_or(AuthError::Invalid)?;
    let plaintext = jwe::decrypt(token, &cek)?;
    let claims: RawClaims = serde_json::from_slice(&plaintext).map_err(|_| AuthError::Invalid)?;
    to_claims(claims, now_unix)
}

/// The key the token was issued with. Without a `kid` Auth.js uses the first secret.
fn matching_cek(
    header: &jwe::ProtectedHeader,
    secrets: &[&str],
    cookie_name: &str,
) -> Option<[u8; jwe::CEK_LEN]> {
    for secret in secrets {
        let Ok(cek) = jwe::derive_cek(secret, cookie_name) else {
            continue;
        };
        match &header.kid {
            None => return Some(cek),
            Some(kid) => {
                if &jwe::thumbprint(&cek) == kid {
                    return Some(cek);
                }
            }
        }
    }
    None
}

/// The session cookie in a `Cookie` header, with the chunks joined the way Auth.js joins them.
///
/// Auth.js splits a long session cookie into `name.0`, `name.1`, … and joins them back by
/// their numeric suffix.
#[must_use]
pub fn session_cookie_from_header(header: &str) -> Option<SessionCookie> {
    session_cookies_from_header(header).into_iter().next()
}

/// Every session cookie in a `Cookie` header, one per cookie name that is present.
///
/// The name matters: it is the salt the key was derived with, so a deployment only ever
/// verifies a token under the name it issued it under.
#[must_use]
pub fn session_cookies_from_header(header: &str) -> Vec<SessionCookie> {
    let cookies = parse_cookie_header(header);
    let mut found = Vec::new();
    for name in [SESSION_COOKIE_NAME, SECURE_SESSION_COOKIE_NAME] {
        let prefix = format!("{name}.");
        let mut chunks: Vec<(f64, usize, &str)> = cookies
            .iter()
            .filter(|(cookie_name, _)| cookie_name == name || cookie_name.starts_with(&prefix))
            .enumerate()
            .map(|(order, (cookie_name, value))| (chunk_index(cookie_name), order, value.as_str()))
            .collect();
        if chunks.is_empty() {
            continue;
        }
        // Stable sort by the numeric suffix, the way `Array.prototype.sort` does it in Auth.js.
        chunks.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.cmp(&b.1))
        });
        let value: String = chunks.iter().map(|(_, _, value)| *value).collect();
        found.push(SessionCookie {
            name: name.to_string(),
            value,
        });
    }
    found
}

/// Decode the session cookie in a `Cookie` header, under either cookie name.
pub fn decode_session_from_cookie_header(
    header: &str,
    secret: &str,
    now_unix: i64,
) -> Result<SessionClaims, AuthError> {
    decode_session_from_cookie_header_with_secrets(header, &[secret], now_unix)
}

/// Decode the session cookie in a `Cookie` header, trying each secret in turn.
pub fn decode_session_from_cookie_header_with_secrets(
    header: &str,
    secrets: &[&str],
    now_unix: i64,
) -> Result<SessionClaims, AuthError> {
    let cookies = session_cookies_from_header(header);
    let mut last = AuthError::Missing;
    for cookie in &cookies {
        match decode_session_cookie_with_secrets(&cookie.value, secrets, &cookie.name, now_unix) {
            Ok(claims) => return Ok(claims),
            Err(error) => last = error,
        }
    }
    Err(last)
}

/// The `Cookie` header as name/value pairs. The first occurrence of a name wins, and the
/// value is percent decoded, the way the `cookie` package Auth.js uses does it.
fn parse_cookie_header(header: &str) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = Vec::new();
    for pair in header.split(';') {
        let Some((name, value)) = pair.split_once('=') else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || pairs.iter().any(|(seen, _)| seen == name) {
            continue;
        }
        pairs.push((name.to_string(), decode_cookie_value(value.trim())));
    }
    pairs
}

/// `decodeURIComponent`, with the same fallback: a value that cannot be decoded is kept as it
/// is.
fn decode_cookie_value(value: &str) -> String {
    if !value.contains('%') {
        return value.to_string();
    }
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes.get(index) == Some(&b'%') {
            let hex = bytes.get(index + 1..index + 3).and_then(|pair| {
                let text = std::str::from_utf8(pair).ok()?;
                if !text.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return None;
                }
                u8::from_str_radix(text, 16).ok()
            });
            match hex {
                Some(byte) => {
                    out.push(byte);
                    index += 3;
                    continue;
                }
                None => return value.to_string(),
            }
        }
        out.push(bytes.get(index).copied().unwrap_or(0));
        index += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.to_string())
}

/// The chunk number of a cookie name, or `NaN` when the name carries no number. Auth.js sorts
/// the chunks with `parseInt`, which gives `NaN` for the unchunked name.
fn chunk_index(cookie_name: &str) -> f64 {
    let last = cookie_name.rsplit('.').next().unwrap_or(cookie_name);
    js_parse_int(last)
}

/// `parseInt` as JavaScript defines it: leading whitespace, an optional sign, digits, and
/// nothing else. Anything else is `NaN`.
fn js_parse_int(text: &str) -> f64 {
    let trimmed = text.trim_start();
    let bytes = trimmed.as_bytes();
    let mut end = 0;
    if matches!(bytes.first(), Some(b'+') | Some(b'-')) {
        end = 1;
    }
    while end < bytes.len() && bytes.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    if end == 0 || (end == 1 && !bytes.first().is_some_and(u8::is_ascii_digit)) {
        return f64::NAN;
    }
    trimmed
        .get(..end)
        .and_then(|n| n.parse::<f64>().ok())
        .unwrap_or(f64::NAN)
}

/// The claims the old app ended up with, and the expiry check it did.
fn to_claims(raw: RawClaims, now_unix: i64) -> Result<SessionClaims, AuthError> {
    // The old app reads `session.user.id` and treats anything else as signed out.
    let id = raw.id.ok_or(AuthError::Invalid)?;
    // Auth.js always sets `exp`; a token without it is not one this app issued.
    let expires_at = raw.exp.ok_or(AuthError::Invalid)?;
    if expires_at <= now_unix.saturating_sub(CLOCK_TOLERANCE_SECONDS) {
        return Err(AuthError::Expired);
    }
    Ok(SessionClaims {
        id,
        role: raw.role,
        email: raw.email,
        name: raw.name,
        sub: raw.sub,
        issued_at: raw.iat,
        expires_at,
    })
}
