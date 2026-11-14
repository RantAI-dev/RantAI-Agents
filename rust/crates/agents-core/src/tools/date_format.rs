//! `format(date, pattern)` of date-fns 4.1.0 with the `en-US` locale, in UTC.
//!
//! The tokenizer is the one of `date-fns/format.js` (the long `P`/`p` forms expanded first,
//! then the tokens, the quoted text and the literals). The tokens below are the ones ported;
//! a token date-fns knows but this port does not (week numbers, ISO years, eras, flexible day
//! periods) is an error rather than a wrong date (differences row 72).

use chrono::{DateTime, Datelike, Timelike, Utc};

/// The letters date-fns has a formatter for.
const FORMATTER_LETTERS: &str = "GyYRuQqMLwIdDEecibBahHKkmsSXxOztT";
/// The letters that take an ordinal `o` suffix.
const ORDINAL_LETTERS: &str = "yYQqMLwIdDecihHKkms";

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const WEEKDAYS: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/// Formats an instant (milliseconds since the epoch) with a date-fns pattern.
///
/// # Errors
/// The message date-fns threw (`Invalid time value`, an unescaped latin letter), or that a
/// token is not ported.
pub(super) fn format(ms: i64, pattern: &str) -> Result<String, String> {
    let date = DateTime::<Utc>::from_timestamp_millis(ms).ok_or("Invalid time value")?;
    let expanded = expand_long(pattern);
    let mut out = String::new();
    for token in tokens(&expanded) {
        if token == "''" {
            out.push('\'');
            continue;
        }
        let Some(first) = token.chars().next() else {
            continue;
        };
        if first == '\'' {
            out.push_str(&clean_escaped(&token));
        } else if FORMATTER_LETTERS.contains(first) {
            out.push_str(&format_token(&date, ms, &token)?);
        } else if first.is_ascii_alphabetic() {
            return Err(format!(
                "Format string contains an unescaped latin alphabet character `{first}`"
            ));
        } else {
            out.push_str(&token);
        }
    }
    Ok(out)
}

/// `longFormattingTokensRegExp` and the `P`/`p` expansion of the `en-US` locale.
fn expand_long(pattern: &str) -> String {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::new();
    let mut at = 0;
    while let Some(&c) = chars.get(at) {
        if c == 'P' || c == 'p' {
            let date_len = run_len(&chars, at, 'P');
            let time_len = run_len(&chars, at + date_len, 'p');
            out.push_str(&long_format(date_len, time_len));
            at += date_len + time_len;
        } else if c == '\'' {
            let end = quoted_end(&chars, at);
            out.extend(chars.get(at..end).unwrap_or(&[]));
            at = end;
        } else {
            out.push(c);
            at += 1;
        }
    }
    out
}

/// The `en-US` pattern of `P…` (`date_len`) followed by `p…` (`time_len`).
fn long_format(date_len: usize, time_len: usize) -> String {
    let date = match date_len {
        0 => "",
        1 => "MM/dd/yyyy",
        2 => "MMM d, y",
        3 => "MMMM do, y",
        _ => "EEEE, MMMM do, y",
    };
    let time = match time_len {
        0 => "",
        1 => "h:mm a",
        2 => "h:mm:ss a",
        3 => "h:mm:ss a z",
        _ => "h:mm:ss a zzzz",
    };
    match (date_len, time_len) {
        (_, 0) => date.to_owned(),
        (0, _) => time.to_owned(),
        (1 | 2, _) => format!("{date}, {time}"),
        _ => format!("{date} 'at' {time}"),
    }
}

/// How many `c` follow from `at`.
fn run_len(chars: &[char], at: usize, c: char) -> usize {
    chars
        .get(at..)
        .unwrap_or(&[])
        .iter()
        .take_while(|&&next| next == c)
        .count()
}

/// Where a quoted run that starts at `at` ends: `''` inside is a quote, an unclosed run goes
/// to the end, and `''` at `at` is its own token.
fn quoted_end(chars: &[char], at: usize) -> usize {
    if chars.get(at + 1) == Some(&'\'') {
        return at + 2;
    }
    let mut end = at + 1;
    while let Some(&c) = chars.get(end) {
        if c == '\'' {
            if chars.get(end + 1) == Some(&'\'') {
                end += 2;
                continue;
            }
            return end + 1;
        }
        end += 1;
    }
    end
}

/// `formattingTokensRegExp`: `Xo`, a run of one word character, `''`, a quoted run, or one
/// character.
fn tokens(pattern: &str) -> Vec<String> {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = Vec::new();
    let mut at = 0;
    while let Some(&c) = chars.get(at) {
        let end = if ORDINAL_LETTERS.contains(c) && chars.get(at + 1) == Some(&'o') {
            at + 2
        } else if c.is_ascii_alphanumeric() || c == '_' {
            at + run_len(&chars, at, c)
        } else if c == '\'' {
            quoted_end(&chars, at)
        } else {
            at + 1
        };
        out.push(chars.get(at..end).unwrap_or(&[]).iter().collect());
        at = end;
    }
    out
}

/// `cleanEscapedString`: the text between the quotes, with `''` as one quote.
fn clean_escaped(token: &str) -> String {
    let inner = token.strip_prefix('\'').unwrap_or(token);
    let inner = inner.strip_suffix('\'').unwrap_or(inner);
    inner.replace("''", "'")
}

/// `addLeadingZeros`.
fn pad(number: i64, width: usize) -> String {
    let sign = if number < 0 { "-" } else { "" };
    format!("{sign}{:0>width$}", number.unsigned_abs())
}

/// `1st`, `2nd`, `3rd`, `11th`.
fn ordinal(number: u32) -> String {
    let suffix = match (number % 100, number % 10) {
        (11..=13, _) => "th",
        (_, 1) => "st",
        (_, 2) => "nd",
        (_, 3) => "rd",
        _ => "th",
    };
    format!("{number}{suffix}")
}

/// One token of the pattern.
fn format_token(date: &DateTime<Utc>, ms: i64, token: &str) -> Result<String, String> {
    let len = token.chars().count();
    let first = token.chars().next().unwrap_or(' ');
    let hour = i64::from(date.hour());
    let month = date.month0() as usize;
    let weekday = date.weekday().num_days_from_sunday() as usize;
    let month_name = MONTHS.get(month).copied().unwrap_or_default();
    let weekday_name = WEEKDAYS.get(weekday).copied().unwrap_or_default();
    let quarter = date.month0() / 3 + 1;
    let pm = date.hour() >= 12;
    let out = match (first, token) {
        ('y', _) if !token.ends_with('o') => {
            let signed = i64::from(date.year());
            let year = if signed > 0 { signed } else { 1 - signed };
            pad(if token == "yy" { year % 100 } else { year }, len)
        }
        ('M' | 'L', "M" | "MM" | "L" | "LL") => pad(i64::from(date.month()), len),
        ('M' | 'L', "MMM" | "LLL") => month_name.chars().take(3).collect(),
        ('M' | 'L', "MMMMM" | "LLLLL") => month_name.chars().take(1).collect(),
        ('M' | 'L', _) if !token.ends_with('o') => month_name.to_owned(),
        ('Q' | 'q', "Q" | "QQ" | "q" | "qq") => pad(i64::from(quarter), len),
        ('Q' | 'q', "QQQ" | "qqq") => format!("Q{quarter}"),
        ('Q' | 'q', "QQQQQ" | "qqqqq") => quarter.to_string(),
        ('Q' | 'q', _) if !token.ends_with('o') => format!("{} quarter", ordinal(quarter)),
        ('d', "do") => ordinal(date.day()),
        ('d', _) => pad(i64::from(date.day()), len),
        ('E', "E" | "EE" | "EEE") => weekday_name.chars().take(3).collect(),
        ('E', "EEEEE") => weekday_name.chars().take(1).collect(),
        ('E', "EEEEEE") => weekday_name.chars().take(2).collect(),
        ('E', _) => weekday_name.to_owned(),
        ('a', "a" | "aa") => if pm { "PM" } else { "AM" }.to_owned(),
        ('a', "aaa") => if pm { "pm" } else { "am" }.to_owned(),
        ('a', "aaaaa") => if pm { "p" } else { "a" }.to_owned(),
        ('a', _) => if pm { "p.m." } else { "a.m." }.to_owned(),
        ('h', _) if !token.ends_with('o') => pad(if hour % 12 == 0 { 12 } else { hour % 12 }, len),
        ('H', _) if !token.ends_with('o') => pad(hour, len),
        ('K', _) if !token.ends_with('o') => pad(hour % 12, len),
        ('k', _) if !token.ends_with('o') => pad(if hour == 0 { 24 } else { hour }, len),
        ('m', _) if !token.ends_with('o') => pad(i64::from(date.minute()), len),
        ('s', _) if !token.ends_with('o') => pad(i64::from(date.second()), len),
        ('S', _) => {
            let millis = f64::from(date.timestamp_subsec_millis());
            let exponent = i32::try_from(len).unwrap_or(i32::MAX).saturating_sub(3);
            let fraction = (millis * 10_f64.powi(exponent)).trunc() as i64;
            pad(fraction, len)
        }
        // UTC: the offset is zero.
        ('X', _) => "Z".to_owned(),
        ('x', "x") => "+00".to_owned(),
        ('x', "xx" | "xxxx") => "+0000".to_owned(),
        ('x', _) => "+00:00".to_owned(),
        ('O' | 'z', "O" | "OO" | "OOO" | "z" | "zz" | "zzz") => "GMT+0".to_owned(),
        ('O' | 'z', _) => "GMT+00:00".to_owned(),
        // `Math.trunc(time / 1000)`: integer division truncates toward zero too.
        ('t', _) => pad(ms / 1000, len),
        ('T', _) => pad(ms, len),
        _ => return Err(format!("Format string token `{token}` is not supported.")),
    };
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2024-03-15T10:30:05.123Z, a Friday.
    const MS: i64 = 1_710_498_605_123;

    fn f(pattern: &str) -> String {
        format(MS, pattern).unwrap_or_else(|error| error)
    }

    #[test]
    fn the_patterns_print_what_date_fns_prints() {
        assert_eq!(f("yyyy-MM-dd'T'HH:mm:ssXXX"), "2024-03-15T10:30:05Z");
        assert_eq!(f("PPpp"), "Mar 15, 2024, 10:30:05 AM");
        assert_eq!(f("PPPP"), "Friday, March 15th, 2024");
        assert_eq!(
            f("PPPPpppp"),
            "Friday, March 15th, 2024 at 10:30:05 AM GMT+00:00"
        );
        assert_eq!(f("P p"), "03/15/2024 10:30 AM");
        assert_eq!(f("yy y yyyyy"), "24 2024 02024");
        assert_eq!(f("EEE EEEE EEEEE EEEEEE"), "Fri Friday F Fr");
        assert_eq!(f("MMM MMMM MMMMM do"), "Mar March M 15th");
        assert_eq!(
            f("h hh H K k a aaa aaaa aaaaa"),
            "10 10 10 10 10 AM am a.m. a"
        );
        assert_eq!(f("S SS SSS SSSS"), "1 12 123 1230");
        assert_eq!(f("x xx xxx z zzzz"), "+00 +0000 +00:00 GMT+0 GMT+00:00");
        assert_eq!(f("Q QQQ QQQQ"), "1 Q1 1st quarter");
        assert_eq!(f("'it''s' dd"), "it's 15");
        assert_eq!(f("t T"), "1710498605 1710498605123");
    }

    #[test]
    fn a_bad_pattern_is_an_error() {
        assert_eq!(
            f("yyyy-MM-dd hh:mm j"),
            "Format string contains an unescaped latin alphabet character `j`"
        );
        assert_eq!(f("ww"), "Format string token `ww` is not supported.");
        assert_eq!(
            format(i64::MAX, "yyyy"),
            Err("Invalid time value".to_owned())
        );
    }
}
