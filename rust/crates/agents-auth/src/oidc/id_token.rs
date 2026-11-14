//! Verifying an OIDC ID token (OpenID Connect Core §3.1.3.7).
//!
//! The signature is checked by `jsonwebtoken` against the provider's JWKS; every claim is checked
//! here, against the clock the caller passes in, so this crate never reads the time.
//!
//! - Only asymmetric algorithms are accepted ([`ALLOWED_ALGORITHMS`]). `none` does not parse as
//!   an algorithm at all, and an HMAC algorithm is refused before any key is looked at, so a
//!   token cannot be "signed" with the provider's public key as an HMAC secret.
//! - The key is chosen by `kid`, and its type, `use` and `alg` must fit the token's algorithm.

use jsonwebtoken::jwk::{AlgorithmParameters, Jwk, JwkSet, PublicKeyUse};
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde_json::{Map, Value};
use subtle::ConstantTimeEq;

/// The algorithms an ID token may be signed with.
pub const ALLOWED_ALGORITHMS: [Algorithm; 8] = [
    Algorithm::RS256,
    Algorithm::RS384,
    Algorithm::RS512,
    Algorithm::PS256,
    Algorithm::PS384,
    Algorithm::PS512,
    Algorithm::ES256,
    Algorithm::ES384,
];

/// How far the provider's clock may be from ours.
pub const LEEWAY_SECONDS: i64 = 60;

/// What the token must say.
#[derive(Debug, Clone, Copy)]
pub struct Expected<'a> {
    /// The issuer, exactly as discovery published it.
    pub issuer: &'a str,
    /// The client id: the audience, and the `azp` when there are several audiences.
    pub client_id: &'a str,
    /// The nonce this flow sent.
    pub nonce: &'a str,
    pub now_unix: i64,
}

/// Why a token was refused. Logged by the caller; the user sees one generic message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum IdTokenError {
    #[error("the token is malformed")]
    Malformed,
    #[error("the token's algorithm is not allowed")]
    AlgorithmNotAllowed,
    /// No key of the JWKS has the token's `kid`: the caller refetches the JWKS once.
    #[error("no key matches the token's kid")]
    UnknownKey,
    #[error("the signature does not verify")]
    BadSignature,
    #[error("the issuer is wrong")]
    WrongIssuer,
    #[error("the audience is wrong")]
    WrongAudience,
    #[error("the token has expired")]
    Expired,
    #[error("the token is not valid yet")]
    NotYetValid,
    #[error("the nonce is wrong")]
    WrongNonce,
    #[error("a required claim is missing")]
    MissingClaim,
}

/// The claims sign-in needs, plus every claim as sent (for the groups claim, whose name is
/// configurable).
#[derive(Debug, Clone, PartialEq)]
pub struct IdTokenClaims {
    pub subject: String,
    pub email: Option<String>,
    /// `email_verified` is `true`, as a boolean or the string `"true"` some providers send.
    pub email_verified: bool,
    pub name: Option<String>,
    pub raw: Map<String, Value>,
}

impl IdTokenClaims {
    /// A string claim.
    #[must_use]
    pub fn string(&self, name: &str) -> Option<&str> {
        self.raw.get(name).and_then(Value::as_str)
    }

    /// A claim that is `true`, or the string `"true"`.
    #[must_use]
    pub fn is_true(&self, name: &str) -> bool {
        matches!(self.raw.get(name), Some(Value::Bool(true)))
            || matches!(self.raw.get(name), Some(Value::String(s)) if s == "true")
    }

    /// A list of strings (the groups claim). A single string counts as a list of one; a claim
    /// that is absent is `None`, which is not the same as an empty list.
    #[must_use]
    pub fn strings(&self, name: &str) -> Option<Vec<String>> {
        match self.raw.get(name)? {
            Value::Array(items) => Some(
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect(),
            ),
            Value::String(s) => Some(vec![s.clone()]),
            _ => Some(Vec::new()),
        }
    }
}

/// Verify `token` against `jwks` and `expected`.
pub fn verify(
    token: &str,
    jwks: &JwkSet,
    expected: &Expected<'_>,
) -> Result<IdTokenClaims, IdTokenError> {
    let header = jsonwebtoken::decode_header(token).map_err(|_| IdTokenError::Malformed)?;
    if !ALLOWED_ALGORITHMS.contains(&header.alg) {
        return Err(IdTokenError::AlgorithmNotAllowed);
    }
    let jwk = select_key(jwks, header.kid.as_deref(), header.alg)?;
    let key = DecodingKey::from_jwk(jwk).map_err(|_| IdTokenError::UnknownKey)?;
    let mut validation = Validation::new(header.alg);
    // The claims are checked below, against the caller's clock.
    validation.validate_exp = false;
    validation.validate_nbf = false;
    validation.validate_aud = false;
    validation.required_spec_claims.clear();
    let data = jsonwebtoken::decode::<Map<String, Value>>(token, &key, &validation).map_err(
        |e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::InvalidSignature => IdTokenError::BadSignature,
            jsonwebtoken::errors::ErrorKind::InvalidAlgorithm => IdTokenError::AlgorithmNotAllowed,
            _ => IdTokenError::Malformed,
        },
    )?;
    check_claims(data.claims, expected)
}

/// The key for `kid` and `alg`. Without a `kid` the set must hold exactly one usable key.
fn select_key<'a>(
    jwks: &'a JwkSet,
    kid: Option<&str>,
    alg: Algorithm,
) -> Result<&'a Jwk, IdTokenError> {
    let usable = |k: &&Jwk| key_fits(k, alg);
    match kid {
        Some(kid) => jwks
            .keys
            .iter()
            .filter(|k| k.common.key_id.as_deref() == Some(kid))
            .find(usable)
            .ok_or(IdTokenError::UnknownKey),
        None => {
            let mut keys = jwks.keys.iter().filter(usable);
            match (keys.next(), keys.next()) {
                (Some(only), None) => Ok(only),
                _ => Err(IdTokenError::UnknownKey),
            }
        }
    }
}

/// A key may verify `alg`: the right key type, a signing key, and the same `alg` if it names one.
fn key_fits(jwk: &Jwk, alg: Algorithm) -> bool {
    let type_fits = match &jwk.algorithm {
        AlgorithmParameters::RSA(_) => matches!(
            alg,
            Algorithm::RS256
                | Algorithm::RS384
                | Algorithm::RS512
                | Algorithm::PS256
                | Algorithm::PS384
                | Algorithm::PS512
        ),
        AlgorithmParameters::EllipticCurve(_) => {
            matches!(alg, Algorithm::ES256 | Algorithm::ES384)
        }
        AlgorithmParameters::OctetKey(_) | AlgorithmParameters::OctetKeyPair(_) => false,
    };
    let use_fits = !matches!(
        jwk.common.public_key_use,
        Some(PublicKeyUse::Encryption | PublicKeyUse::Other(_))
    );
    let alg_fits = jwk
        .common
        .key_algorithm
        .is_none_or(|named| format!("{named:?}") == format!("{alg:?}"));
    type_fits && use_fits && alg_fits
}

fn check_claims(
    raw: Map<String, Value>,
    expected: &Expected<'_>,
) -> Result<IdTokenClaims, IdTokenError> {
    let text = |name: &str| raw.get(name).and_then(Value::as_str);
    let number = |name: &str| raw.get(name).and_then(Value::as_i64);

    if text("iss") != Some(expected.issuer) {
        return Err(IdTokenError::WrongIssuer);
    }
    let audiences: Vec<&str> = match raw.get("aud") {
        Some(Value::String(one)) => vec![one.as_str()],
        Some(Value::Array(many)) => many.iter().filter_map(Value::as_str).collect(),
        _ => return Err(IdTokenError::WrongAudience),
    };
    if !audiences.contains(&expected.client_id) {
        return Err(IdTokenError::WrongAudience);
    }
    // Core §3.1.3.7 (4, 5): with several audiences the authorised party must be us.
    if let Some(azp) = text("azp") {
        if azp != expected.client_id {
            return Err(IdTokenError::WrongAudience);
        }
    } else if audiences.len() > 1 {
        return Err(IdTokenError::WrongAudience);
    }
    let exp = number("exp").ok_or(IdTokenError::MissingClaim)?;
    if exp.saturating_add(LEEWAY_SECONDS) <= expected.now_unix {
        return Err(IdTokenError::Expired);
    }
    let iat = number("iat").ok_or(IdTokenError::MissingClaim)?;
    if iat > expected.now_unix.saturating_add(LEEWAY_SECONDS) {
        return Err(IdTokenError::NotYetValid);
    }
    if let Some(nbf) = number("nbf")
        && nbf > expected.now_unix.saturating_add(LEEWAY_SECONDS)
    {
        return Err(IdTokenError::NotYetValid);
    }
    let nonce = text("nonce").ok_or(IdTokenError::WrongNonce)?;
    if nonce
        .as_bytes()
        .ct_eq(expected.nonce.as_bytes())
        .unwrap_u8()
        != 1
    {
        return Err(IdTokenError::WrongNonce);
    }
    let subject = text("sub")
        .filter(|s| !s.is_empty())
        .ok_or(IdTokenError::MissingClaim)?
        .to_owned();
    let claims = IdTokenClaims {
        subject,
        email: text("email").map(str::to_owned),
        email_verified: false,
        name: text("name").map(str::to_owned),
        raw,
    };
    Ok(IdTokenClaims {
        email_verified: claims.is_true("email_verified"),
        ..claims
    })
}
