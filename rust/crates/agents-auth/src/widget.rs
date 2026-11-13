//! Widget embed keys: `rantai_live_…`.
//!
//! Unlike the agent API keys, the widget key is stored as it is presented: the old route
//! looks it up in the `EmbedApiKey` table by the key itself. Only the shape is checked
//! before the lookup.
//!
//! Reference: `src/lib/embed/api-key-generator.ts` (`validateApiKeyFormat`) and
//! `src/features/widget/chat/service.ts`.

/// The prefix every widget embed key carries.
pub const WIDGET_API_KEY_PREFIX: &str = "rantai_live_";
/// The random part of a key: 32 characters of base64url.
pub const WIDGET_API_KEY_RANDOM_LEN: usize = 32;

/// Whether the key has the shape the generator produces: `rantai_live_` and 32 characters of
/// base64url.
#[must_use]
pub fn is_valid_widget_api_key_format(key: &str) -> bool {
    key.strip_prefix(WIDGET_API_KEY_PREFIX).is_some_and(|rest| {
        rest.len() == WIDGET_API_KEY_RANDOM_LEN
            && rest
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    })
}
