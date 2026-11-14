//! `text_utilities`: statistics, e-mail and URL extraction, slugs, truncation and regex matches.
//!
//! Old: `src/lib/tools/builtin/text-utilities.ts`. Lengths and match indices are UTF-16 code
//! units, as `string.length` counts them. A `regex_match` pattern is compiled with Rust's
//! `regex`, which has no look-around and no back-references and reads `\d`, `\w` and `\b` as
//! Unicode classes (differences row 74).

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};

use super::{js, text};

pub const INPUT_SCHEMA: &str = r#"{"type":"object","properties":{"text":{"type":"string","description":"The text to process"},"operation":{"type":"string","enum":["summarize_stats","extract_emails","extract_urls","slug","truncate","regex_match"],"description":"Operation: 'summarize_stats' = word/char/sentence counts, 'extract_emails' = find email addresses, 'extract_urls' = find URLs, 'slug' = create URL slug, 'truncate' = truncate text, 'regex_match' = match regex pattern"},"pattern":{"type":"string","description":"Regex pattern for regex_match operation"},"maxLength":{"type":"number","default":100,"description":"Maximum length for truncate operation"}},"required":["text","operation"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}"#;

static SENTENCE_END: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"[.!?]+").ok());
static PARAGRAPH_BREAK: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\n\s*\n").ok());
static EMAIL: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").ok());
static URL: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r#"https?://[^\s<>"{}|\\^`\[\]]+"#).ok());
// JavaScript's `\w` is ASCII.
static NOT_SLUG: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"[^A-Za-z0-9_\s-]").ok());
static SPACES: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\s+").ok());
static DASHES: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"-+").ok());
static EDGE_DASH: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"^-|-$").ok());
static LAST_WORD: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\s+\S*$").ok());

/// Runs the tool.
#[must_use]
pub fn run(input: &Map<String, Value>) -> Value {
    let body = text(input, "text").unwrap_or_default();
    let outcome = match text(input, "operation").unwrap_or_default() {
        "summarize_stats" => stats(body),
        "extract_emails" => extract(&EMAIL, body),
        "extract_urls" => extract(&URL, body),
        "slug" => slug(body).map(|slug| json!({"success": true, "result": slug})),
        "truncate" => truncate(
            body,
            input
                .get("maxLength")
                .and_then(Value::as_f64)
                .unwrap_or(100.0),
        ),
        "regex_match" => regex_match(body, text(input, "pattern").unwrap_or_default()),
        other => Err(format!("Unknown operation: {other}")),
    };
    outcome.unwrap_or_else(|error| json!({"success": false, "error": error}))
}

/// A pattern of this module; they are constants, so they compile.
fn pattern(regex: &'static LazyLock<Option<Regex>>) -> Result<&'static Regex, String> {
    regex
        .as_ref()
        .ok_or_else(|| "Text operation failed".to_owned())
}

fn stats(body: &str) -> Result<Value, String> {
    let words: Vec<&str> = body
        .split(char::is_whitespace)
        .filter(|w| !w.is_empty())
        .collect();
    let sentences = pattern(&SENTENCE_END)?
        .split(body)
        .filter(|s| !s.trim().is_empty())
        .count();
    let paragraphs = pattern(&PARAGRAPH_BREAK)?
        .split(body)
        .filter(|p| !p.trim().is_empty())
        .count();
    let average = if words.is_empty() {
        0.0
    } else {
        let total: usize = words.iter().map(|word| js::utf16_len(word)).sum();
        let mean = total as f64 / words.len() as f64;
        js::math_round(mean * 10.0) / 10.0
    };
    Ok(json!({
        "success": true,
        "result": {
            "characters": js::utf16_len(body),
            "words": words.len(),
            "sentences": sentences,
            "paragraphs": paragraphs,
            "averageWordLength": js::number(average),
        },
    }))
}

/// Every distinct match, in the order of first appearance (`[...new Set(...)]`).
fn extract(regex: &'static LazyLock<Option<Regex>>, body: &str) -> Result<Value, String> {
    let mut found: Vec<&str> = Vec::new();
    for item in pattern(regex)?.find_iter(body) {
        if !found.contains(&item.as_str()) {
            found.push(item.as_str());
        }
    }
    Ok(json!({"success": true, "result": found, "count": found.len()}))
}

fn slug(body: &str) -> Result<String, String> {
    let lower = body.to_lowercase();
    let slug = pattern(&NOT_SLUG)?.replace_all(lower.trim(), "");
    let slug = pattern(&SPACES)?.replace_all(&slug, "-");
    let slug = pattern(&DASHES)?.replace_all(&slug, "-");
    Ok(pattern(&EDGE_DASH)?.replace_all(&slug, "").into_owned())
}

fn truncate(body: &str, max_length: f64) -> Result<Value, String> {
    // `(params.maxLength as number) || 100`.
    let max_length = if max_length == 0.0 || max_length.is_nan() {
        100.0
    } else {
        max_length
    };
    let length = js::utf16_len(body);
    if length as f64 <= max_length {
        return Ok(json!({"success": true, "result": body, "truncated": false}));
    }
    // `slice(0, maxLen)`: a negative end counts from the end. The cut never splits a
    // character, where JavaScript could split a surrogate pair.
    let end = if max_length < 0.0 {
        length.saturating_sub((-max_length).trunc().min(length as f64) as usize)
    } else {
        max_length.trunc().min(length as f64) as usize
    };
    let mut units = 0;
    let mut cut = 0;
    for (index, c) in body.char_indices() {
        if units + c.len_utf16() > end {
            break;
        }
        units += c.len_utf16();
        cut = index + c.len_utf8();
    }
    let head = body.get(..cut).unwrap_or_default();
    let head = pattern(&LAST_WORD)?.replace(head, "");
    Ok(json!({"success": true, "result": format!("{head}..."), "truncated": true}))
}

fn regex_match(body: &str, source: &str) -> Result<Value, String> {
    if source.is_empty() {
        return Err("'pattern' is required for regex_match operation".to_owned());
    }
    let regex = Regex::new(source).map_err(|_| {
        format!("Invalid regular expression: /{source}/: the pattern is not supported")
    })?;
    let names: Vec<&str> = regex.capture_names().flatten().collect();
    let mut matches = Vec::new();
    for captures in regex.captures_iter(body) {
        let Some(whole) = captures.get(0) else {
            continue;
        };
        let groups = if names.is_empty() {
            Value::Null
        } else {
            let mut groups = Map::new();
            for name in &names {
                // A group that did not take part is `undefined`, which JSON leaves out.
                if let Some(group) = captures.name(name) {
                    groups.insert((*name).to_owned(), Value::from(group.as_str()));
                }
            }
            Value::Object(groups)
        };
        matches.push(json!({
            "match": whole.as_str(),
            "index": js::utf16_len(body.get(..whole.start()).unwrap_or_default()),
            "groups": groups,
        }));
    }
    let count = matches.len();
    Ok(json!({"success": true, "result": matches, "count": count}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(value: Value) -> Value {
        run(value.as_object().unwrap_or(&Map::new()))
    }

    #[test]
    fn the_statistics_count_like_javascript() {
        assert_eq!(
            call(
                json!({"text": "Hello world. How are you?\n\nFine!", "operation": "summarize_stats"})
            ),
            json!({"success": true, "result": {"characters": 32, "words": 6, "sentences": 3, "paragraphs": 2, "averageWordLength": 4.3}})
        );
    }

    #[test]
    fn extraction_keeps_the_first_of_each() {
        assert_eq!(
            call(json!({"text": "a@b.co, c@d.io and a@b.co", "operation": "extract_emails"})),
            json!({"success": true, "result": ["a@b.co", "c@d.io"], "count": 2})
        );
        assert_eq!(
            call(
                json!({"text": "see https://x.io/a?b=1, or <http://y.dev>", "operation": "extract_urls"})
            ),
            json!({"success": true, "result": ["https://x.io/a?b=1,", "http://y.dev"], "count": 2})
        );
    }

    #[test]
    fn slug_and_truncate_follow_the_old_rules() {
        assert_eq!(
            call(json!({"text": "  Héllo, World -- 2024!  ", "operation": "slug"})),
            json!({"success": true, "result": "hllo-world-2024"})
        );
        assert_eq!(
            call(json!({"text": "the quick brown fox", "operation": "truncate", "maxLength": 12})),
            json!({"success": true, "result": "the quick...", "truncated": true})
        );
        assert_eq!(
            call(json!({"text": "short", "operation": "truncate", "maxLength": 100})),
            json!({"success": true, "result": "short", "truncated": false})
        );
    }

    #[test]
    fn a_regex_reports_utf16_indices_and_named_groups() {
        assert_eq!(
            call(
                json!({"text": "😀 a1 b22", "operation": "regex_match", "pattern": "(?<l>[a-z])(?<d>[0-9]+)"})
            ),
            json!({"success": true, "result": [
                {"match": "a1", "index": 3, "groups": {"l": "a", "d": "1"}},
                {"match": "b22", "index": 6, "groups": {"l": "b", "d": "22"}},
            ], "count": 2})
        );
        assert_eq!(
            call(json!({"text": "x", "operation": "regex_match", "pattern": "(?=x)"})),
            json!({"success": false, "error": "Invalid regular expression: /(?=x)/: the pattern is not supported"})
        );
        assert_eq!(
            call(json!({"text": "x", "operation": "regex_match"})),
            json!({"success": false, "error": "'pattern' is required for regex_match operation"})
        );
    }
}
