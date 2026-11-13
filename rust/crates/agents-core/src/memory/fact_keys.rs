//! Fact and preference key normalization.
//!
//! Ported from `src/lib/memory/fact-keys.ts`. The model writes free-form labels ("base",
//! "Kota", "warna-favorit", "favorite color"), so every merge, conflict check and forget
//! goes through [`normalize_memory_key`] and those labels collapse onto one canonical key.

use std::sync::LazyLock;

use regex::Regex;

/// Predicates that can hold several values at once. Everything else is single-valued: a new
/// value replaces the old one.
pub const MULTI_VALUE_PREDICATES: [&str; 7] = [
    "interest", "language", "skill", "hobby", "visited", "allergy", "pet",
];

/// The key a label that carries no usable text becomes.
pub const UNKNOWN_KEY: &str = "unknown";

/// The characters JavaScript's `[^\p{L}\p{N}_]` keeps.
///
/// Rust's `char::is_alphabetic` also accepts the Other_Alphabetic marks (the combining
/// signs of Arabic, Devanagari, Thai and others), which JavaScript's `\p{L}` does not, so
/// the Unicode property comes from the regex crate.
static NON_WORD: LazyLock<Result<Regex, regex::Error>> =
    LazyLock::new(|| Regex::new(r"[^\p{L}\p{N}_]"));

/// Lowercase, trim, spaces/dashes/dots -> `_`, collapse repeats, apply synonyms.
///
/// The old code did this with a chain of regular expressions:
///
/// ```text
/// .trim().toLowerCase()
/// .replace(/['’]/g, '')
/// .replace(/[\s\-./]+/g, '_')
/// .replace(/[^\p{L}\p{N}_]/gu, '')
/// .replace(/_+/g, '_')
/// .replace(/^_|_$/g, '')
/// ```
#[must_use]
pub fn normalize_memory_key(raw: Option<&str>) -> String {
    let Some(raw) = raw else {
        return UNKNOWN_KEY.to_owned();
    };
    if raw.is_empty() {
        return UNKNOWN_KEY.to_owned();
    }

    // .trim().toLowerCase()
    let mut text = crate::memory::text::js_trim(raw).to_lowercase();

    // .replace(/['’]/g, '')
    text = text
        .chars()
        .filter(|c| *c != '\'' && *c != '\u{2019}')
        .collect();

    // .replace(/[\s\-./]+/g, '_')
    let mut with_underscores = String::with_capacity(text.len());
    let mut in_run = false;
    for c in text.chars() {
        if crate::memory::text::is_js_whitespace(c) || matches!(c, '-' | '.' | '/') {
            if !in_run {
                with_underscores.push('_');
                in_run = true;
            }
        } else {
            with_underscores.push(c);
            in_run = false;
        }
    }

    // .replace(/[^\p{L}\p{N}_]/gu, '')
    let text = match &*NON_WORD {
        Ok(regex) => regex.replace_all(&with_underscores, "").into_owned(),
        // The pattern is a constant and cannot fail to compile. This crate forbids
        // panicking, so the fallback keeps the text as it is.
        Err(_) => with_underscores,
    };

    // .replace(/_+/g, '_') and .replace(/^_|_$/g, '')
    let mut collapsed = String::with_capacity(text.len());
    let mut previous_underscore = false;
    for c in text.chars() {
        if c == '_' {
            if !previous_underscore {
                collapsed.push(c);
            }
            previous_underscore = true;
        } else {
            collapsed.push(c);
            previous_underscore = false;
        }
    }
    let trimmed = collapsed.trim_matches('_');

    if trimmed.is_empty() {
        return UNKNOWN_KEY.to_owned();
    }
    canonical_key(trimmed).to_owned()
}

/// The canonical key of a normalized label.
fn canonical_key(key: &str) -> &str {
    match key {
        // location / residence
        "base" | "basis" | "based_in" | "home_base" | "city" | "current_city" | "home_city"
        | "kota" | "kota_tinggal" | "lokasi" | "domisili" | "tempat_tinggal" | "tinggal"
        | "residence" | "lives_in" | "live_in" | "living_in" | "current_location"
        | "city_of_residence" => "location",
        // favorite color
        "favourite_color" | "favorite_colour" | "favourite_colour" | "fav_color" | "color"
        | "colour" | "preferred_color" | "color_preference" | "warna" | "warna_favorit"
        | "warna_favorite" | "warna_kesukaan" => "favorite_color",
        // identity
        "nama" | "full_name" | "first_name" | "nama_lengkap" => "name",
        "umur" | "usia" => "age",
        "job" | "profession" | "pekerjaan" | "profesi" | "kerja" | "role" | "job_title" => {
            "occupation"
        }
        // plural multi-value keys -> singular
        "hobbies" | "hobi" => "hobby",
        "skills" | "keahlian" => "skill",
        "languages" | "bahasa" => "language",
        "interests" | "minat" => "interest",
        _ => key,
    }
}

/// Can this predicate hold several values at once?
#[must_use]
pub fn is_multi_value_predicate(predicate: &str) -> bool {
    let normalized = normalize_memory_key(Some(predicate));
    MULTI_VALUE_PREDICATES.contains(&normalized.as_str())
}

/// Does a stored key match a forget-request key? An exact canonical match, or every token of
/// the request key appearing in the stored key ("location" matches "work_location").
#[must_use]
pub fn memory_key_matches(stored_key: &str, request_key: &str) -> bool {
    let stored = normalize_memory_key(Some(stored_key));
    let request = normalize_memory_key(Some(request_key));
    if stored == UNKNOWN_KEY || request == UNKNOWN_KEY {
        return false;
    }
    if stored == request {
        return true;
    }
    let stored_tokens: Vec<&str> = stored.split('_').collect();
    request
        .split('_')
        .all(|token| !token.is_empty() && stored_tokens.contains(&token))
}

/// Case-insensitive "value mentions keyword" check. A keyword under two UTF-16 code units
/// never matches.
#[must_use]
pub fn memory_value_matches(value: Option<&str>, keyword: &str) -> bool {
    let Some(value) = value else {
        return false;
    };
    if value.is_empty() {
        return false;
    }
    let keyword = crate::memory::text::js_trim(keyword).to_lowercase();
    if crate::memory::text::utf16_len(&keyword) < 2 {
        return false;
    }
    value.to_lowercase().contains(&keyword)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalizes_case_separators_and_synonyms() {
        assert_eq!(normalize_memory_key(Some("Base")), "location");
        assert_eq!(normalize_memory_key(Some("kota")), "location");
        assert_eq!(normalize_memory_key(Some("Lokasi")), "location");
        assert_eq!(
            normalize_memory_key(Some("warna-favorit")),
            "favorite_color"
        );
        assert_eq!(
            normalize_memory_key(Some("Favorite Color")),
            "favorite_color"
        );
        assert_eq!(
            normalize_memory_key(Some("favourite_colour")),
            "favorite_color"
        );
        assert_eq!(normalize_memory_key(Some("Hobbies")), "hobby");
        assert_eq!(normalize_memory_key(Some("  job title ")), "occupation");
        assert_eq!(normalize_memory_key(Some("shoe-size")), "shoe_size");
    }

    #[test]
    fn an_empty_label_is_unknown() {
        assert_eq!(normalize_memory_key(None), "unknown");
        assert_eq!(normalize_memory_key(Some("")), "unknown");
        assert_eq!(normalize_memory_key(Some("!!!")), "unknown");
    }

    #[test]
    fn a_keyword_of_one_character_never_matches() {
        assert!(!memory_value_matches(Some("Bandung"), "a"));
        // An emoji is two UTF-16 code units, so it is long enough.
        assert!(memory_value_matches(Some("I love 😀"), "😀"));
    }
}
