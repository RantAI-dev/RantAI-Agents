//! The ID token check, one refusal per rule, each next to the token that passes.
//!
//! The keys in `fixtures/` are throwaway RSA keys made for these tests; nothing trusts them.

use agents_auth::oidc::id_token::{Expected, IdTokenError, verify};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde_json::{Value, json};

const KEY: &str = include_str!("fixtures/oidc-test-rsa.pem");
const KEY_N: &str = include_str!("fixtures/oidc-test-rsa.n");
const OTHER_KEY: &str = include_str!("fixtures/oidc-other-rsa.pem");
const ISSUER: &str = "https://idp.example.com/realms/acme";
const CLIENT: &str = "rantai";
const NOW: i64 = 1_800_000_000;

type R = Result<(), Box<dyn std::error::Error>>;

fn jwks() -> Result<JwkSet, serde_json::Error> {
    serde_json::from_value(json!({ "keys": [
        { "kty": "RSA", "kid": "k1", "use": "sig", "alg": "RS256", "n": KEY_N.trim(), "e": "AQAB" }
    ]}))
}

fn claims() -> Value {
    json!({
        "iss": ISSUER, "aud": CLIENT, "sub": "sub-1", "nonce": "n-1",
        "iat": NOW - 5, "exp": NOW + 300, "email": "ada@acme.test", "email_verified": true
    })
}

fn sign_with(
    pem: &str,
    kid: Option<&str>,
    claims: &Value,
) -> Result<String, jsonwebtoken::errors::Error> {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = kid.map(str::to_owned);
    jsonwebtoken::encode(&header, claims, &EncodingKey::from_rsa_pem(pem.as_bytes())?)
}

fn sign(claims: &Value) -> Result<String, jsonwebtoken::errors::Error> {
    sign_with(KEY, Some("k1"), claims)
}

fn expected() -> Expected<'static> {
    Expected {
        issuer: ISSUER,
        client_id: CLIENT,
        nonce: "n-1",
        now_unix: NOW,
    }
}

fn with(field: &str, value: Value) -> Value {
    let mut c = claims();
    if let Some(map) = c.as_object_mut() {
        map.insert(field.to_owned(), value);
    }
    c
}

#[test]
fn a_good_token_passes() -> R {
    let claims = verify(&sign(&claims())?, &jwks()?, &expected())?;
    assert_eq!(claims.subject, "sub-1");
    assert_eq!(claims.email.as_deref(), Some("ada@acme.test"));
    assert!(claims.email_verified);
    Ok(())
}

#[test]
fn a_token_signed_by_another_key_is_refused() -> R {
    let token = sign_with(OTHER_KEY, Some("k1"), &claims())?;
    assert_eq!(
        verify(&token, &jwks()?, &expected()),
        Err(IdTokenError::BadSignature)
    );
    Ok(())
}

#[test]
fn a_tampered_payload_is_refused() -> R {
    let token = sign(&claims())?;
    let mut parts: Vec<String> = token.split('.').map(str::to_owned).collect();
    let forged = agents_auth::base64url::encode(
        serde_json::to_string(&with("sub", json!("admin")))?.as_bytes(),
    );
    if let Some(p) = parts.get_mut(1) {
        *p = forged;
    }
    assert_eq!(
        verify(&parts.join("."), &jwks()?, &expected()),
        Err(IdTokenError::BadSignature)
    );
    Ok(())
}

#[test]
fn an_unknown_kid_is_reported_so_the_caller_refetches() -> R {
    let token = sign_with(KEY, Some("rotated"), &claims())?;
    assert_eq!(
        verify(&token, &jwks()?, &expected()),
        Err(IdTokenError::UnknownKey)
    );
    Ok(())
}

#[test]
fn the_wrong_issuer_audience_or_azp_is_refused() -> R {
    let set = jwks()?;
    let wrong_iss = sign(&with("iss", json!("https://evil.example.com")))?;
    assert_eq!(
        verify(&wrong_iss, &set, &expected()),
        Err(IdTokenError::WrongIssuer)
    );
    let wrong_aud = sign(&with("aud", json!("someone-else")))?;
    assert_eq!(
        verify(&wrong_aud, &set, &expected()),
        Err(IdTokenError::WrongAudience)
    );
    let many_no_azp = sign(&with("aud", json!([CLIENT, "other"])))?;
    assert_eq!(
        verify(&many_no_azp, &set, &expected()),
        Err(IdTokenError::WrongAudience)
    );
    let mut c = with("aud", json!([CLIENT, "other"]));
    if let Some(m) = c.as_object_mut() {
        m.insert("azp".into(), json!(CLIENT));
    }
    assert!(verify(&sign(&c)?, &set, &expected()).is_ok());
    Ok(())
}

#[test]
fn expiry_has_a_small_leeway_and_no_more() -> R {
    let set = jwks()?;
    let just_expired = sign(&with("exp", json!(NOW - 30)))?;
    assert!(verify(&just_expired, &set, &expected()).is_ok());
    let expired = sign(&with("exp", json!(NOW - 61)))?;
    assert_eq!(
        verify(&expired, &set, &expected()),
        Err(IdTokenError::Expired)
    );
    let future = sign(&with("iat", json!(NOW + 600)))?;
    assert_eq!(
        verify(&future, &set, &expected()),
        Err(IdTokenError::NotYetValid)
    );
    Ok(())
}

#[test]
fn the_wrong_or_missing_nonce_is_refused() -> R {
    let set = jwks()?;
    let wrong = sign(&with("nonce", json!("n-2")))?;
    assert_eq!(
        verify(&wrong, &set, &expected()),
        Err(IdTokenError::WrongNonce)
    );
    let mut c = claims();
    if let Some(m) = c.as_object_mut() {
        m.remove("nonce");
    }
    assert_eq!(
        verify(&sign(&c)?, &set, &expected()),
        Err(IdTokenError::WrongNonce)
    );
    Ok(())
}

#[test]
fn alg_none_is_refused() -> R {
    let header = agents_auth::base64url::encode(br#"{"alg":"none","kid":"k1"}"#);
    let payload = agents_auth::base64url::encode(serde_json::to_string(&claims())?.as_bytes());
    let token = format!("{header}.{payload}.");
    assert!(verify(&token, &jwks()?, &expected()).is_err());
    Ok(())
}

#[test]
fn hs256_signed_with_the_public_key_is_refused() -> R {
    // The classic confusion: the attacker uses the published key bytes as an HMAC secret.
    let header = Header {
        kid: Some("k1".into()),
        ..Header::new(Algorithm::HS256)
    };
    let token = jsonwebtoken::encode(
        &header,
        &claims(),
        &EncodingKey::from_secret(KEY_N.trim().as_bytes()),
    )?;
    assert_eq!(
        verify(&token, &jwks()?, &expected()),
        Err(IdTokenError::AlgorithmNotAllowed)
    );
    // An `oct` key in the JWKS does not help either: it never fits an allowed algorithm.
    let with_oct: JwkSet = serde_json::from_value(json!({ "keys": [
        { "kty": "oct", "kid": "k1", "k": agents_auth::base64url::encode(KEY_N.trim().as_bytes()) }
    ]}))?;
    assert!(verify(&token, &with_oct, &expected()).is_err());
    Ok(())
}

#[test]
fn email_verified_as_a_string_counts_and_absent_does_not() -> R {
    let set = jwks()?;
    let as_text = verify(
        &sign(&with("email_verified", json!("true")))?,
        &set,
        &expected(),
    )?;
    assert!(as_text.email_verified);
    let mut c = claims();
    if let Some(m) = c.as_object_mut() {
        m.remove("email_verified");
    }
    assert!(!verify(&sign(&c)?, &set, &expected())?.email_verified);
    Ok(())
}
