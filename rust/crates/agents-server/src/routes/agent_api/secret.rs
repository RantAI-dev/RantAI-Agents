//! The secret of an agent API key: generating one, and the mask the dashboard shows.
//!
//! Old: `generateAgentApiKey` and `maskAgentApiKey` in `src/lib/embed/api-key-generator.ts`.
//! The shape is the same — `rantai_sk_` and 32 characters of base64url, which is 24 random
//! bytes — so a key generated here is accepted by every client that already holds one, and the
//! hash `agents_auth::api_key` builds is the same value the old code stored.

use base64::Engine as _;

use agents_auth::api_key::{AGENT_API_KEY_PREFIX, hash_agent_api_key};
use agents_contracts::error_codes::ErrorCode;

use crate::http::ApiError;

/// A new key, and the hash the row stores.
///
/// # Errors
/// A 500 when the system's random source refuses, which is not a request problem.
pub fn generate() -> Result<Generated, ApiError> {
    let mut bytes = [0_u8; 24];
    getrandom::getrandom(&mut bytes).map_err(|error| {
        tracing::error!(error = %error, "the API key could not be generated");
        ApiError::new(ErrorCode::Internal)
    })?;
    let secret = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let key = format!("{AGENT_API_KEY_PREFIX}{secret}");
    Ok(Generated {
        hash: hash_agent_api_key(&key),
        hint: mask(&key),
        key,
    })
}

/// A key that was just made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Generated {
    /// The whole key. Shown once, in the create response, and never stored.
    pub key: String,
    /// `hex(SHA-256(key))`, what the row stores and what authentication looks up.
    pub hash: String,
    /// The masked key the dashboard shows from then on.
    pub hint: String,
}

/// 128 random bits as 32 hexadecimal characters: a session id nobody can guess.
///
/// # Errors
/// A 500 when the system's random source refuses.
pub fn random_id() -> Result<String, ApiError> {
    let mut bytes = [0_u8; 16];
    getrandom::getrandom(&mut bytes).map_err(|error| {
        tracing::error!(error = %error, "a random id could not be generated");
        ApiError::new(ErrorCode::Internal)
    })?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// `rantai_sk_abcd…wxyz`: the first twelve characters, an ellipsis and the last four.
///
/// Masking a mask gives the mask back, so a row stores this and every read returns it
/// unchanged. A value shorter than sixteen characters is left alone, as the old function did.
#[must_use]
pub fn mask(key: &str) -> String {
    if key.chars().count() < 16 {
        return key.to_owned();
    }
    let head: String = key.chars().take(12).collect();
    let tail: String = key.chars().skip(key.chars().count() - 4).collect();
    format!("{head}…{tail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_is_the_prefix_and_thirty_two_characters() {
        let generated = generate();
        let Ok(generated) = generated else {
            return;
        };
        assert!(generated.key.starts_with(AGENT_API_KEY_PREFIX));
        assert_eq!(generated.key.len(), AGENT_API_KEY_PREFIX.len() + 32);
        assert!(agents_auth::api_key::is_valid_agent_api_key_format(
            &generated.key
        ));
        assert_eq!(generated.hash, hash_agent_api_key(&generated.key));
        assert_eq!(generated.hash.len(), 64);
    }

    #[test]
    fn the_mask_keeps_the_ends_and_hides_the_rest() {
        let key = "rantai_sk_abcdefghijklmnopqrstuvwxyz012345";
        let masked = mask(key);
        assert_eq!(masked, "rantai_sk_ab…2345");
        assert!(!masked.contains("cdefghij"));
        // Idempotent: a stored mask reads back as itself.
        assert_eq!(mask(&masked), "rantai_sk_ab…2345");
        assert_eq!(mask("short"), "short");
    }

    #[test]
    fn two_keys_are_not_the_same() {
        let (Ok(first), Ok(second)) = (generate(), generate()) else {
            return;
        };
        assert_ne!(first.key, second.key);
        assert_ne!(first.hash, second.hash);
    }
}
