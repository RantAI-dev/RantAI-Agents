//! Agent API keys: `rantai_sk_…`.
//!
//! The database stores the key hashed, and the route looks it up by that hash: the hex
//! SHA-256 of the presented key, unsalted. The keys carry 192 random bits, so salting buys
//! nothing, and the hash has to stay byte for byte the one the SQL backfill wrote.
//!
//! Reference: `src/lib/embed/api-key-generator.ts` (`hashAgentApiKey`) and
//! `src/features/agent-api-keys/service.ts` (`authenticateAgentApiKey`).

use sha2::{Digest, Sha256};

use crate::AuthError;

/// The prefix every agent API key carries.
pub const AGENT_API_KEY_PREFIX: &str = "rantai_sk_";
/// The random part of a key: 32 characters of base64url.
pub const AGENT_API_KEY_RANDOM_LEN: usize = 32;

/// A presented agent API key, split into its parts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentApiKey {
    /// The prefix, `rantai_sk_`.
    pub prefix: String,
    /// The random part.
    pub secret: String,
}

/// The value the database stores and the route looks up: the hex SHA-256 of the presented
/// key.
#[must_use]
pub fn hash_agent_api_key(key: &str) -> String {
    let digest = Sha256::digest(key.as_bytes());
    let mut hex = String::with_capacity(64);
    for byte in digest.iter() {
        hex.push(hex_digit(byte >> 4));
        hex.push(hex_digit(byte & 0x0f));
    }
    hex
}

/// Whether the key has the shape the generator produces. The old route does not check this
/// before the lookup; the key is looked up by its hash whatever it looks like.
#[must_use]
pub fn is_valid_agent_api_key_format(key: &str) -> bool {
    key.strip_prefix(AGENT_API_KEY_PREFIX).is_some_and(|rest| {
        rest.len() == AGENT_API_KEY_RANDOM_LEN
            && rest
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    })
}

/// Split a presented key into its parts, refusing anything that is not shaped like one.
pub fn parse_agent_api_key(key: &str) -> Result<AgentApiKey, AuthError> {
    if !is_valid_agent_api_key_format(key) {
        return Err(AuthError::Invalid);
    }
    let secret = key
        .strip_prefix(AGENT_API_KEY_PREFIX)
        .ok_or(AuthError::Invalid)?;
    Ok(AgentApiKey {
        prefix: AGENT_API_KEY_PREFIX.to_string(),
        secret: secret.to_string(),
    })
}

/// The caller's IP, the way the old route reads it: the first hop of `x-forwarded-for`, else
/// `x-real-ip`.
#[must_use]
pub fn client_ip(x_forwarded_for: Option<&str>, x_real_ip: Option<&str>) -> Option<String> {
    let forwarded = x_forwarded_for
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(ip) = forwarded {
        return Some(ip.to_string());
    }
    x_real_ip
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

/// The old whitelist semantics: an empty list allows every address, a non-empty one requires
/// the request IP to be in it. The comparison is on the text, exactly as the old code does it.
#[must_use]
pub fn ip_allowed(whitelist: &[String], request_ip: Option<&str>) -> bool {
    if whitelist.is_empty() {
        return true;
    }
    match request_ip {
        Some(ip) => whitelist.iter().any(|allowed| allowed == ip),
        None => false,
    }
}

/// A lowercase hex digit.
fn hex_digit(nibble: u8) -> char {
    match nibble {
        0..=9 => char::from(b'0' + nibble),
        _ => char::from(b'a' + (nibble - 10)),
    }
}
