//! The mobile Bearer JWT: HS256 over `NEXTAUTH_SECRET`, valid for 30 days.
//!
//! Reference: `src/lib/mobile-auth.ts` (`signMobileToken`, `userIdFromMobileToken`).

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Sha384, Sha512};
use subtle::ConstantTimeEq;

use crate::AuthError;
use crate::base64url;

/// How long a mobile token is valid: the old code signs with `setExpirationTime("30d")`.
pub const MOBILE_TOKEN_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;

/// What the mobile token says about the caller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileClaims {
    /// The `sub` claim: the user id. The old code reads nothing else for the user id.
    pub user_id: String,
    /// The `email` claim.
    pub email: Option<String>,
    /// The `role` claim.
    pub role: Option<String>,
    /// `iat`: when the token was issued.
    pub issued_at: Option<i64>,
    /// `exp`: when the token expires.
    pub expires_at: Option<i64>,
}

/// The claims of the token the old code signs, in the order `jose` writes them.
#[derive(Serialize)]
struct Payload<'a> {
    email: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<&'a str>,
    sub: &'a str,
    iat: i64,
    exp: i64,
}

#[derive(Serialize)]
struct Header {
    alg: &'static str,
}

#[derive(Deserialize)]
struct RawClaims {
    #[serde(default)]
    sub: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    iat: Option<i64>,
    #[serde(default)]
    exp: Option<i64>,
}

#[derive(Deserialize)]
struct RawHeader {
    alg: String,
}

/// Verify a mobile token: the signature, then the expiry.
pub fn verify_mobile_token(
    token: &str,
    secret: &str,
    now_unix: i64,
) -> Result<MobileClaims, AuthError> {
    let [header_text, payload_text, signature_text] = jwt_parts(token)?;
    let header: RawHeader =
        serde_json::from_slice(&base64url::decode(header_text)?).map_err(|_| AuthError::Invalid)?;
    let signing_input = format!("{header_text}.{payload_text}");
    verify_signature(
        &header.alg,
        secret,
        signing_input.as_bytes(),
        &base64url::decode(signature_text)?,
    )?;
    let claims: RawClaims = serde_json::from_slice(&base64url::decode(payload_text)?)
        .map_err(|_| AuthError::Invalid)?;
    to_claims(claims, now_unix)
}

/// Sign a mobile token, with the claims and the expiry the old code uses.
///
/// `issued_at` is the caller's clock: the old code sets `iat` to now and `exp` to 30 days
/// later.
pub fn sign_mobile_token(
    user_id: &str,
    email: &str,
    role: Option<&str>,
    secret: &str,
    issued_at: i64,
) -> Result<String, AuthError> {
    let header = base64url::encode(
        &serde_json::to_vec(&Header { alg: "HS256" }).map_err(|_| AuthError::Invalid)?,
    );
    let payload = base64url::encode(
        &serde_json::to_vec(&Payload {
            email,
            role,
            sub: user_id,
            iat: issued_at,
            exp: issued_at.saturating_add(MOBILE_TOKEN_TTL_SECONDS),
        })
        .map_err(|_| AuthError::Invalid)?,
    );
    let signing_input = format!("{header}.{payload}");
    let signature = sign_hmac_sha256(secret, signing_input.as_bytes())?;
    Ok(format!("{signing_input}.{signature}"))
}

/// The three parts of a compact JWS.
fn jwt_parts(token: &str) -> Result<[&str; 3], AuthError> {
    let parts: Vec<&str> = token.split('.').collect();
    parts.try_into().map_err(|_| AuthError::Invalid)
}

/// The signature check, for the HMAC algorithms `jose` accepts for a symmetric key.
fn verify_signature(
    alg: &str,
    secret: &str,
    signing_input: &[u8],
    signature: &[u8],
) -> Result<(), AuthError> {
    let expected: Vec<u8> = match alg {
        "HS256" => hmac_sha256(secret, signing_input)?,
        "HS384" => hmac_sha384(secret, signing_input)?,
        "HS512" => hmac_sha512(secret, signing_input)?,
        _ => return Err(AuthError::Invalid),
    };
    if expected.ct_eq(signature).unwrap_u8() != 1 {
        return Err(AuthError::Invalid);
    }
    Ok(())
}

/// HMAC-SHA-256, base64url encoded without padding.
fn sign_hmac_sha256(secret: &str, signing_input: &[u8]) -> Result<String, AuthError> {
    Ok(base64url::encode(&hmac_sha256(secret, signing_input)?))
}

/// HMAC with the given digest.
macro_rules! hmac_with {
    ($name:ident, $digest:ty) => {
        fn $name(secret: &str, signing_input: &[u8]) -> Result<Vec<u8>, AuthError> {
            let mut mac = <Hmac<$digest> as Mac>::new_from_slice(secret.as_bytes())
                .map_err(|_| AuthError::Invalid)?;
            mac.update(signing_input);
            Ok(mac.finalize().into_bytes().to_vec())
        }
    };
}

hmac_with!(hmac_sha256, Sha256);
hmac_with!(hmac_sha384, Sha384);
hmac_with!(hmac_sha512, Sha512);

/// The claims the old code ended up with, and the expiry check it did.
fn to_claims(raw: RawClaims, now_unix: i64) -> Result<MobileClaims, AuthError> {
    // The old code reads `payload.sub` and nothing else for the user id.
    let user_id = raw.sub.ok_or(AuthError::Invalid)?;
    // The old code always signs with an expiry; a token without one is not one it issued.
    let expires_at = raw.exp.ok_or(AuthError::Invalid)?;
    // `jose` has no clock tolerance here: the token is dead the second it expires.
    if expires_at <= now_unix {
        return Err(AuthError::Expired);
    }
    Ok(MobileClaims {
        user_id,
        email: raw.email,
        role: raw.role,
        issued_at: raw.iat,
        expires_at: Some(expires_at),
    })
}
