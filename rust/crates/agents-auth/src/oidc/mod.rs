//! OpenID Connect sign-in: PKCE, the in-flight flow cookie, and ID token verification.
//!
//! The flow between `start` and `callback` lives in a cookie, never in server memory, so any
//! instance can finish it. The cookie is a JWE (`dir` + `A256CBC-HS512`) under a key derived from
//! the auth secret with its own salt ([`FLOW_COOKIE_SALT`]): encrypted, so the PKCE verifier and
//! nonce stay secret, and authenticated, so it cannot be forged or edited.

pub mod id_token;

/// The JWKS type the verifier takes, so callers need not depend on `jsonwebtoken`.
pub use jsonwebtoken::jwk::JwkSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{AuthError, base64url, jwe};

/// The HKDF salt of the flow cookie's key. Not a session cookie name, so a flow cookie can never
/// be read as a session and the other way round.
pub const FLOW_COOKIE_SALT: &str = "rantai.sso-flow";

/// How long a sign-in may take between `start` and `callback`.
pub const FLOW_TTL_SECONDS: i64 = 10 * 60;

/// The PKCE `S256` challenge for a verifier (RFC 7636 §4.2).
#[must_use]
pub fn pkce_challenge(verifier: &str) -> String {
    base64url::encode(&Sha256::digest(verifier.as_bytes()))
}

/// A random value as a URL-safe string: the PKCE verifier (43 characters from 32 bytes, inside
/// RFC 7636's 43 to 128), the `state` and the `nonce`.
#[must_use]
pub fn random_token(bytes: &[u8; 32]) -> String {
    base64url::encode(bytes)
}

/// What the callback needs to finish the flow `start` began.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowState {
    /// The provider the flow was started for; the callback's path must name the same one.
    pub provider_id: String,
    pub state: String,
    pub nonce: String,
    pub verifier: String,
    /// Where to send the browser afterwards: a path on this site.
    pub return_to: String,
    /// When the flow started, in milliseconds, by the database's clock. A login from this flow
    /// is refused if the identity already signed in after it (a replayed callback).
    pub started_at_ms: i64,
    pub expires_at: i64,
}

/// Seal a flow into the cookie value. `iv` is 16 fresh random bytes.
pub fn seal_flow(
    flow: &FlowState,
    secret: &str,
    iv: &[u8; jwe::IV_LEN],
) -> Result<String, AuthError> {
    let cek = jwe::derive_cek(secret, FLOW_COOKIE_SALT)?;
    let header = format!(
        "{{\"alg\":\"{}\",\"enc\":\"{}\"}}",
        jwe::ALG_DIR,
        jwe::ENC_A256CBC_HS512
    );
    let payload = serde_json::to_vec(flow).map_err(|_| AuthError::Invalid)?;
    jwe::encrypt(&header, &payload, &cek, iv)
}

/// Open a flow cookie: any configured secret may have sealed it, and it must not have expired.
pub fn open_flow(token: &str, secrets: &[&str], now_unix: i64) -> Result<FlowState, AuthError> {
    let header = jwe::protected_header(token)?;
    if header.alg != jwe::ALG_DIR || header.enc != jwe::ENC_A256CBC_HS512 {
        return Err(AuthError::Invalid);
    }
    for secret in secrets {
        let cek = jwe::derive_cek(secret, FLOW_COOKIE_SALT)?;
        if let Ok(plaintext) = jwe::decrypt(token, &cek) {
            let flow: FlowState =
                serde_json::from_slice(&plaintext).map_err(|_| AuthError::Invalid)?;
            if flow.expires_at <= now_unix {
                return Err(AuthError::Expired);
            }
            return Ok(flow);
        }
    }
    Err(AuthError::Invalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow(expires_at: i64) -> FlowState {
        FlowState {
            provider_id: "p1".into(),
            state: "s".into(),
            nonce: "n".into(),
            verifier: "v".into(),
            return_to: "/dashboard".into(),
            started_at_ms: 1,
            expires_at,
        }
    }

    #[test]
    fn a_flow_round_trips_under_any_configured_secret() -> Result<(), AuthError> {
        let sealed = seal_flow(&flow(100), "old", &[3; 16])?;
        assert_eq!(open_flow(&sealed, &["new", "old"], 50)?, flow(100));
        Ok(())
    }

    #[test]
    fn an_expired_forged_or_session_keyed_flow_is_refused() -> Result<(), AuthError> {
        let sealed = seal_flow(&flow(100), "k", &[3; 16])?;
        assert_eq!(open_flow(&sealed, &["k"], 100), Err(AuthError::Expired));
        assert_eq!(open_flow(&sealed, &["other"], 50), Err(AuthError::Invalid));
        // A session cookie is encrypted under another salt: it is not a flow.
        let session = crate::session_issue::encode_session_token(
            &crate::session_issue::NewSession {
                user_id: "u",
                name: None,
                email: None,
                role: None,
            },
            "k",
            crate::session::SESSION_COOKIE_NAME,
            1,
            &[3; 16],
            "j",
        )?;
        assert_eq!(open_flow(&session, &["k"], 50), Err(AuthError::Invalid));
        Ok(())
    }

    #[test]
    fn the_pkce_challenge_is_the_rfc_7636_example() {
        // RFC 7636 Appendix B.
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
}
