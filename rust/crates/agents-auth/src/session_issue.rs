//! Issuing the NextAuth v5 session cookie, so the pages Next.js still serves accept a session
//! Rust signed in.
//!
//! Mirrors `encode` in `@auth/core/jwt` and the credentials branch of
//! `@auth/core/lib/actions/callback`: the token is `{ name, email, picture, sub }` passed through
//! the app's `jwt` callback (which adds `id` and `role`, `src/lib/auth.ts`), then `iat`, `exp` and
//! `jti`; the header is `{ alg: "dir", enc: "A256CBC-HS512", kid: <thumbprint> }`. Decoding is in
//! [`crate::session`].

use serde::Serialize;

use crate::AuthError;
use crate::jwe;
use crate::session::{SECURE_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME};

/// `session.maxAge` and the token's lifetime: Auth.js's default, which `src/lib/auth.ts` keeps.
pub const SESSION_MAX_AGE_SECONDS: i64 = 30 * 24 * 60 * 60;

/// Auth.js splits a cookie value longer than this into `name.0`, `name.1`, …
/// (`ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE` in `@auth/core/lib/utils/cookie.js`).
pub const CHUNK_SIZE: usize = 4096 - 160;

/// Who the session is for. `name` and `email` are the user's row, `role` the platform role.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSession<'a> {
    pub user_id: &'a str,
    pub name: Option<&'a str>,
    pub email: Option<&'a str>,
    pub role: Option<&'a str>,
}

/// The payload, in the order Auth.js builds it. `picture` is `user.image`, which this app's users
/// do not have, so `JSON.stringify` drops it; it is left out here for the same reason.
#[derive(Serialize)]
struct Payload<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<&'a str>,
    sub: &'a str,
    id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<&'a str>,
    iat: i64,
    exp: i64,
    jti: &'a str,
}

/// The session cookie name: `__Secure-authjs.session-token` when the deployment is served over
/// HTTPS, `authjs.session-token` otherwise (`defaultCookies(useSecureCookies)`).
#[must_use]
pub const fn session_cookie_name(secure: bool) -> &'static str {
    if secure {
        SECURE_SESSION_COOKIE_NAME
    } else {
        SESSION_COOKIE_NAME
    }
}

/// The session token for `session`, issued at `now_unix`.
///
/// `secret` is the first configured secret (Auth.js encodes with `secrets[0]`), `cookie_name` the
/// name the cookie is set under (it is the HKDF salt), `iv` 16 fresh random bytes and `jti` a
/// fresh random UUID: the caller supplies both, so this crate stays free of randomness.
pub fn encode_session_token(
    session: &NewSession<'_>,
    secret: &str,
    cookie_name: &str,
    now_unix: i64,
    iv: &[u8; jwe::IV_LEN],
    jti: &str,
) -> Result<String, AuthError> {
    let cek = jwe::derive_cek(secret, cookie_name)?;
    let header = format!(
        "{{\"alg\":\"{}\",\"enc\":\"{}\",\"kid\":\"{}\"}}",
        jwe::ALG_DIR,
        jwe::ENC_A256CBC_HS512,
        jwe::thumbprint(&cek)
    );
    let payload = serde_json::to_vec(&Payload {
        name: session.name,
        email: session.email,
        sub: session.user_id,
        id: session.user_id,
        role: session.role,
        iat: now_unix,
        exp: now_unix.saturating_add(SESSION_MAX_AGE_SECONDS),
        jti,
    })
    .map_err(|_| AuthError::Invalid)?;
    jwe::encrypt(&header, &payload, &cek, iv)
}

/// The cookies a token is set as: one when it fits, `name.0`, `name.1`, … when it does not, the
/// way `SessionStore.chunk` splits it.
#[must_use]
pub fn chunk_cookie(name: &str, value: &str) -> Vec<(String, String)> {
    if value.len() <= CHUNK_SIZE {
        return vec![(name.to_owned(), value.to_owned())];
    }
    // The token is base64url and dots, so every byte is one character and slicing is safe.
    value
        .as_bytes()
        .chunks(CHUNK_SIZE)
        .enumerate()
        .map(|(i, part)| {
            (
                format!("{name}.{i}"),
                String::from_utf8_lossy(part).into_owned(),
            )
        })
        .collect()
}

/// A random 16 bytes as an RFC 4122 version 4 UUID, the shape `crypto.randomUUID()` gives.
#[must_use]
pub fn uuid_v4(mut bytes: [u8; 16]) -> String {
    if let Some(b) = bytes.get_mut(6) {
        *b = (*b & 0x0f) | 0x40;
    }
    if let Some(b) = bytes.get_mut(8) {
        *b = (*b & 0x3f) | 0x80;
    }
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let part = |r: std::ops::Range<usize>| hex.get(r).unwrap_or_default().to_owned();
    format!(
        "{}-{}-{}-{}-{}",
        part(0..8),
        part(8..12),
        part(12..16),
        part(16..20),
        part(20..32)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::decode_session_cookie;

    const SECRET: &str = "a-test-secret-that-is-long-enough";

    fn session() -> NewSession<'static> {
        NewSession {
            user_id: "u1",
            name: Some("Ada"),
            email: Some("ada@example.com"),
            role: Some("USER"),
        }
    }

    #[test]
    fn an_issued_token_decodes_under_the_same_name() -> Result<(), AuthError> {
        for secure in [false, true] {
            let name = session_cookie_name(secure);
            let token = encode_session_token(&session(), SECRET, name, 1_000, &[7; 16], "j")?;
            let claims = decode_session_cookie(&token, SECRET, name, 1_001)?;
            assert_eq!(claims.id, "u1");
            assert_eq!(claims.sub.as_deref(), Some("u1"));
            assert_eq!(claims.role.as_deref(), Some("USER"));
            assert_eq!(claims.email.as_deref(), Some("ada@example.com"));
            assert_eq!(claims.issued_at, Some(1_000));
            assert_eq!(claims.expires_at, 1_000 + SESSION_MAX_AGE_SECONDS);
        }
        Ok(())
    }

    #[test]
    fn the_cookie_name_is_the_salt() -> Result<(), AuthError> {
        let token = encode_session_token(
            &session(),
            SECRET,
            SESSION_COOKIE_NAME,
            1_000,
            &[7; 16],
            "j",
        )?;
        assert_eq!(
            decode_session_cookie(&token, SECRET, SECURE_SESSION_COOKIE_NAME, 1_001),
            Err(AuthError::Invalid)
        );
        assert_eq!(
            decode_session_cookie(&token, "another-secret", SESSION_COOKIE_NAME, 1_001),
            Err(AuthError::Invalid)
        );
        Ok(())
    }

    #[test]
    fn a_long_value_is_chunked_and_a_short_one_is_not() {
        assert_eq!(chunk_cookie("n", "abc"), vec![("n".into(), "abc".into())]);
        let long = "x".repeat(CHUNK_SIZE * 2 + 1);
        let chunks = chunk_cookie("n", &long);
        let names: Vec<&str> = chunks.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["n.0", "n.1", "n.2"]);
        let joined: String = chunks.iter().map(|(_, v)| v.as_str()).collect();
        assert_eq!(joined, long);
    }

    #[test]
    fn a_uuid_has_the_version_and_variant_bits() {
        let id = uuid_v4([0xff; 16]);
        assert_eq!(id, "ffffffff-ffff-4fff-bfff-ffffffffffff");
    }
}
