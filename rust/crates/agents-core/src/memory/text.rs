//! The JavaScript string semantics the memory rules depend on.
//!
//! The old code is TypeScript, and three of its string operations do not have a Rust
//! equivalent that behaves the same:
//!
//! - `String.prototype.trim` removes U+FEFF (the byte order mark) and keeps U+0085.
//!   Rust's `str::trim` does the opposite.
//! - `String.prototype.length` counts UTF-16 code units, not bytes. A keyword of one
//!   character can be two code units (`"😀"`), and the forget rules compare against that
//!   length.
//! - `Array.prototype.sort` compares strings by UTF-16 code unit. Rust compares `str` by
//!   byte, which orders a character above U+FFFF before U+E000..U+FFFF instead of after
//!   it.

use std::cmp::Ordering;

/// The characters JavaScript's `\s` and `trim` treat as whitespace: WhiteSpace and
/// LineTerminator. It includes U+FEFF and excludes U+0085.
#[must_use]
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{9}'..='\u{d}'
            | '\u{20}'
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

/// `String.prototype.trim` in JavaScript.
#[must_use]
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// `String.prototype.length` in JavaScript: the number of UTF-16 code units.
#[must_use]
pub fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Compare two strings the way JavaScript's `<` does: by UTF-16 code unit.
#[must_use]
pub fn js_cmp(a: &str, b: &str) -> Ordering {
    let mut left = a.encode_utf16();
    let mut right = b.encode_utf16();
    loop {
        match (left.next(), right.next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => match x.cmp(&y) {
                Ordering::Equal => continue,
                other => return other,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_removes_the_byte_order_mark_and_keeps_next_line() {
        assert_eq!(js_trim("\u{feff} x \u{feff}"), "x");
        assert_eq!(js_trim("\u{85}x\u{85}"), "\u{85}x\u{85}");
        assert_eq!(js_trim("\u{a0}x\u{a0}"), "x");
    }

    #[test]
    fn length_counts_utf16_code_units() {
        assert_eq!(utf16_len("😀"), 2);
        assert_eq!(utf16_len("é"), 1);
        assert_eq!(utf16_len("ab"), 2);
    }

    #[test]
    fn comparison_follows_utf16_code_units() {
        // U+FFFD is one code unit, U+1F600 is a surrogate pair: JavaScript puts the
        // emoji first, a byte comparison puts it last.
        assert_eq!(js_cmp("\u{1f600}", "\u{fffd}"), Ordering::Less);
        assert_eq!("\u{fffd}".cmp("\u{1f600}"), Ordering::Less);
    }
}
