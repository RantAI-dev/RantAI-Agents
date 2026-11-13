//! Parity with the TypeScript this port replaces.
//!
//! Every vector in `port/cases/auth.jsonl` is issued by `port/oracle/auth.ts`, which uses the
//! real Auth.js and `jose` code. A valid vector must decode to the same claims here; an
//! invalid one must be refused.

use std::error::Error;
use std::fs;
use std::path::PathBuf;

use agents_auth::api_key;
use agents_auth::mobile;
use agents_auth::session;
use agents_auth::widget;
use serde_json::Value;

/// The vectors, as the oracle wrote them.
fn cases() -> Result<Vec<Value>, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../port/cases/auth.jsonl");
    let text = fs::read_to_string(path)?;
    let mut parsed = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        parsed.push(serde_json::from_str::<Value>(line)?);
    }
    Ok(parsed)
}

/// The cases of one kind.
fn cases_of_kind<'a>(cases: &'a [Value], kind: &str) -> Vec<&'a Value> {
    cases
        .iter()
        .filter(|case| case.get("kind").and_then(Value::as_str) == Some(kind))
        .collect()
}

/// The name of a case, for the failure message.
fn name_of(case: &Value) -> String {
    case.get("name")
        .and_then(Value::as_str)
        .unwrap_or("<unnamed>")
        .to_string()
}

/// The string field of a case.
fn string_field<'a>(case: &'a Value, field: &str) -> Result<&'a str, Box<dyn Error>> {
    case.get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("the case has no {} field", field).into())
}

/// The integer field of a case.
fn int_field(case: &Value, field: &str) -> Result<i64, Box<dyn Error>> {
    case.get(field)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("the case has no {} field", field).into())
}

/// Whether the case expects the credential to be accepted.
fn expects_valid(case: &Value) -> bool {
    case.get("expect")
        .and_then(|expect| expect.get("valid"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[test]
fn session_vectors_match() -> Result<(), Box<dyn Error>> {
    let all = cases()?;
    let selected = cases_of_kind(&all, "session");
    assert!(!selected.is_empty(), "no session vectors");
    for case in selected {
        let cookie = string_field(case, "cookie")?;
        let now = int_field(case, "now")?;
        let secrets: Vec<&str> = match case.get("secrets") {
            Some(Value::Array(list)) => list.iter().filter_map(Value::as_str).collect(),
            _ => vec![string_field(case, "secret")?],
        };
        let decoded =
            session::decode_session_from_cookie_header_with_secrets(cookie, &secrets, now);
        if !expects_valid(case) {
            assert!(
                decoded.is_err(),
                "{}: the session cookie was accepted, it must be refused",
                name_of(case)
            );
            continue;
        }
        let claims = decoded.map_err(|error| {
            format!("{}: the session cookie was refused: {error}", name_of(case))
        })?;
        let expected = case
            .get("expect")
            .and_then(|expect| expect.get("claims"))
            .ok_or("the case has no expected claims")?;
        let actual = serde_json::to_value(&claims)?;
        assert_eq!(
            &actual,
            expected,
            "{}: the claims are not the ones Auth.js wrote",
            name_of(case)
        );
    }
    Ok(())
}

#[test]
fn mobile_vectors_match() -> Result<(), Box<dyn Error>> {
    let all = cases()?;
    let selected = cases_of_kind(&all, "mobile");
    assert!(!selected.is_empty(), "no mobile vectors");
    for case in selected {
        let token = string_field(case, "token")?;
        let now = int_field(case, "now")?;
        let secret = string_field(case, "secret")?;
        let verified = mobile::verify_mobile_token(token, secret, now);
        if !expects_valid(case) {
            assert!(
                verified.is_err(),
                "{}: the mobile token was accepted, it must be refused",
                name_of(case)
            );
            continue;
        }
        let claims = verified
            .map_err(|error| format!("{}: the mobile token was refused: {error}", name_of(case)))?;
        let expected = case
            .get("expect")
            .and_then(|expect| expect.get("claims"))
            .ok_or("the case has no expected claims")?;
        let actual = serde_json::to_value(&claims)?;
        assert_eq!(
            &actual,
            expected,
            "{}: the claims are not the ones the old code signed",
            name_of(case)
        );

        // The token the old code signed must be the token this code signs.
        let issued_token = case.get("issuedToken").and_then(Value::as_str);
        let issued_at = case.get("issuedAt").and_then(Value::as_i64);
        if let (Some(issued_token), Some(issued_at)) = (issued_token, issued_at) {
            let signed = mobile::sign_mobile_token(
                &claims.user_id,
                claims.email.as_deref().unwrap_or_default(),
                claims.role.as_deref(),
                secret,
                issued_at,
            )?;
            assert_eq!(
                signed,
                issued_token,
                "{}: the signed token is not the one `jose` signed",
                name_of(case)
            );
        }
    }
    Ok(())
}

#[test]
fn api_key_vectors_match() -> Result<(), Box<dyn Error>> {
    let all = cases()?;
    let selected = cases_of_kind(&all, "api-key");
    assert!(!selected.is_empty(), "no API key vectors");
    for case in selected {
        let key = string_field(case, "key")?;
        let expected = case
            .get("expect")
            .and_then(|expect| expect.get("hash"))
            .and_then(Value::as_str)
            .ok_or("the case has no expected hash")?;
        assert_eq!(
            api_key::hash_agent_api_key(key),
            expected,
            "{}: the lookup value is not the one the old code computes",
            name_of(case)
        );
        let format_valid = case
            .get("expect")
            .and_then(|expect| expect.get("formatValid"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        assert_eq!(
            api_key::is_valid_agent_api_key_format(key),
            format_valid,
            "{}: the format check does not match",
            name_of(case)
        );
    }
    Ok(())
}

#[test]
fn widget_key_vectors_match() -> Result<(), Box<dyn Error>> {
    let all = cases()?;
    let selected = cases_of_kind(&all, "widget-key");
    assert!(!selected.is_empty(), "no widget key vectors");
    for case in selected {
        let key = string_field(case, "key")?;
        let format_valid = case
            .get("expect")
            .and_then(|expect| expect.get("formatValid"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        assert_eq!(
            widget::is_valid_widget_api_key_format(key),
            format_valid,
            "{}: the format check does not match",
            name_of(case)
        );
    }
    Ok(())
}

#[test]
fn ip_vectors_match() -> Result<(), Box<dyn Error>> {
    let all = cases()?;
    let selected = cases_of_kind(&all, "ip");
    assert!(!selected.is_empty(), "no address vectors");
    for case in selected {
        let forwarded = case.get("xForwardedFor").and_then(Value::as_str);
        let real_ip = case.get("xRealIp").and_then(Value::as_str);
        let whitelist: Vec<String> = case
            .get("whitelist")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let request_ip = api_key::client_ip(forwarded, real_ip);
        let expected_ip = case
            .get("expect")
            .and_then(|expect| expect.get("requestIp"))
            .and_then(Value::as_str);
        assert_eq!(
            request_ip.as_deref(),
            expected_ip,
            "{}: the address of the caller is not the one the old route reads",
            name_of(case)
        );
        let allowed = case
            .get("expect")
            .and_then(|expect| expect.get("allowed"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        assert_eq!(
            api_key::ip_allowed(&whitelist, request_ip.as_deref()),
            allowed,
            "{}: the whitelist does not match",
            name_of(case)
        );
    }
    Ok(())
}
