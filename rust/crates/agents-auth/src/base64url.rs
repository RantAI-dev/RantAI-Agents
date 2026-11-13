//! base64url the way JOSE encodes it: no padding, `+` and `/` replaced by `-` and `_`.

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;

use crate::AuthError;

/// Encode without padding.
#[must_use]
pub fn encode(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Decode. Padding is tolerated, because other encoders leave it behind; anything else is
/// not base64url and is refused.
pub fn decode(text: &str) -> Result<Vec<u8>, AuthError> {
    URL_SAFE_NO_PAD
        .decode(text.trim_end_matches('='))
        .map_err(|_| AuthError::Invalid)
}
