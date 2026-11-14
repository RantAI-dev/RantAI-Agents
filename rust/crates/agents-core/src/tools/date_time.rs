//! `date_time`: the current time, formatting, differences and additions.
//!
//! Old: `src/lib/tools/builtin/date-time.ts` over date-fns 4.1.0. The old tool ran in the
//! server's local time zone; the port runs in UTC (differences row 72, as rows 5, 31 and 51).
//! The arithmetic follows date-fns: `differenceIn*` truncates toward zero and treats a partial
//! last month or year as not full, `addMonths` clamps to the end of the month, and a fractional
//! amount of days or months is truncated the way `Date.setDate` truncates it.

use std::sync::LazyLock;

use chrono::{DateTime, Datelike, Days, NaiveDate, Timelike, Utc};
use regex::Regex;
use serde_json::{Map, Value, json};

use super::{date_format, text};

pub const INPUT_SCHEMA: &str = r#"{"type":"object","properties":{"operation":{"type":"string","enum":["now","format","diff","add"],"description":"Operation: 'now' = current time, 'format' = format a date, 'diff' = difference between two dates, 'add' = add time to a date"},"date":{"type":"string","description":"ISO 8601 date string (e.g. '2024-03-15T10:30:00Z')"},"format":{"type":"string","description":"date-fns format string (e.g. 'yyyy-MM-dd', 'PPpp'). Default: ISO 8601"},"amount":{"type":"number","description":"Amount of time to add (can be negative to subtract)"},"unit":{"type":"string","enum":["minutes","hours","days","weeks","months","years"],"description":"Time unit for diff/add operations"},"date2":{"type":"string","description":"Second ISO 8601 date for 'diff' operation"}},"required":["operation"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}"#;

const ISO_FORMAT: &str = "yyyy-MM-dd'T'HH:mm:ssXXX";
const MS_PER_DAY: i64 = 86_400_000;
/// The largest instant a JavaScript `Date` holds.
const MAX_TIME: f64 = 8.64e15;

/// Runs the tool. `now_ms` is the current instant.
#[must_use]
pub fn run(input: &Map<String, Value>, now_ms: i64) -> Value {
    let operation = text(input, "operation").unwrap_or_default();
    let outcome = match operation {
        "now" => now(input, now_ms),
        "format" => format_date(input),
        "diff" => Ok(diff(input)),
        "add" => add(input),
        other => Err(format!("Unknown operation: {other}")),
    };
    outcome.unwrap_or_else(|error| json!({"success": false, "error": error}))
}

/// `(params.format as string) || fallback`: an empty pattern is the fallback too.
fn pattern<'a>(input: &'a Map<String, Value>, fallback: &'a str) -> &'a str {
    text(input, "format")
        .filter(|pattern| !pattern.is_empty())
        .unwrap_or(fallback)
}

/// A string field that must be there and not be empty (`!params.date`).
fn present<'a>(input: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    text(input, key).filter(|value| !value.is_empty())
}

fn now(input: &Map<String, Value>, now_ms: i64) -> Result<Value, String> {
    Ok(json!({
        "success": true,
        "result": date_format::format(now_ms, pattern(input, ISO_FORMAT))?,
        "timestamp": now_ms,
        "iso": iso(now_ms)?,
    }))
}

fn format_date(input: &Map<String, Value>) -> Result<Value, String> {
    let Some(date) = present(input, "date") else {
        return Err("'date' parameter is required for format operation".to_owned());
    };
    let ms = parse_iso(date).ok_or("Invalid time value")?;
    Ok(json!({
        "success": true,
        "result": date_format::format(ms, pattern(input, "PPpp"))?,
        "timestamp": ms,
    }))
}

fn diff(input: &Map<String, Value>) -> Value {
    let (Some(first), Some(second)) = (present(input, "date"), present(input, "date2")) else {
        return json!({"success": false, "error": "'date' and 'date2' are required for diff operation"});
    };
    let unit = text(input, "unit")
        .filter(|unit| !unit.is_empty())
        .unwrap_or("days");
    let difference = match (parse_iso(first), parse_iso(second)) {
        (Some(earlier), Some(later)) => difference(unit, later, earlier),
        // An invalid date makes every date-fns difference `NaN`, and the tool still succeeded.
        _ => None,
    };
    let shown = difference.map_or_else(|| "NaN".to_owned(), |value| value.to_string());
    json!({
        "success": true,
        "result": format!("{shown} {unit}"),
        "difference": difference,
        "unit": unit,
    })
}

fn add(input: &Map<String, Value>) -> Result<Value, String> {
    let Some(date) = present(input, "date") else {
        return Err("'date' parameter is required for add operation".to_owned());
    };
    let Some(amount) = input.get("amount").and_then(Value::as_f64) else {
        return Err("'amount' parameter is required for add operation".to_owned());
    };
    let unit = text(input, "unit")
        .filter(|unit| !unit.is_empty())
        .unwrap_or("days");
    let result = parse_iso(date)
        .and_then(|ms| add_to(unit, ms, amount))
        .ok_or("Invalid time value")?;
    Ok(json!({
        "success": true,
        "result": date_format::format(result, pattern(input, ISO_FORMAT))?,
        "timestamp": result,
        "iso": iso(result)?,
    }))
}

/// `Date.prototype.toISOString`.
fn iso(ms: i64) -> Result<String, String> {
    let date = DateTime::<Utc>::from_timestamp_millis(ms).ok_or("Invalid time value")?;
    Ok(date.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
}

static ISO: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(
        r"^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?|([0-9]{2})([0-9]{2}))?(?:[T ]([0-9]{2})(?::?([0-9]{2})(?::?([0-9]{2})(?:[.,]([0-9]+))?)?)?(Z|[+-][0-9]{2}(?::?[0-9]{2})?)?)?$",
    )
    .ok()
});

/// `parseISO` for the ISO-8601 forms: a date (`2024`, `2024-03`, `2024-03-15`, `20240315`),
/// optionally a time after `T` or a space, optionally a zone. A time without a zone is UTC
/// (differences row 6).
#[must_use]
pub fn parse_iso(text: &str) -> Option<i64> {
    let captures = ISO.as_ref()?.captures(text)?;
    let number = |index: usize| -> Option<i64> {
        captures
            .get(index)
            .and_then(|found| found.as_str().parse::<i64>().ok())
    };
    let year = number(1)?;
    let month = number(2).or_else(|| number(4)).unwrap_or(1);
    let day = number(3).or_else(|| number(5)).unwrap_or(1);
    let hours = number(6).unwrap_or(0);
    let minutes = number(7).unwrap_or(0);
    let seconds = number(8).unwrap_or(0);
    let date = NaiveDate::from_ymd_opt(
        i32::try_from(year).ok()?,
        u32::try_from(month).ok()?,
        u32::try_from(day).ok()?,
    )?;
    let valid_time = (hours == 24 && minutes == 0 && seconds == 0)
        || ((0..24).contains(&hours) && (0..60).contains(&minutes) && (0..60).contains(&seconds));
    if !valid_time {
        return None;
    }
    let fraction = captures
        .get(9)
        .and_then(|found| format!("0.{}", found.as_str()).parse::<f64>().ok())
        .unwrap_or(0.0);
    let offset = match captures.get(10).map(|found| found.as_str()) {
        None | Some("Z") => 0,
        Some(zone) => {
            let sign = if zone.starts_with('-') { -1 } else { 1 };
            let digits: String = zone.chars().filter(char::is_ascii_digit).collect();
            let zone_hours = digits.get(..2)?.parse::<i64>().ok()?;
            let zone_minutes = digits
                .get(2..)
                .filter(|m| !m.is_empty())
                .map_or(Some(0), |m| m.parse::<i64>().ok())?;
            if zone_hours > 23 || zone_minutes > 59 {
                return None;
            }
            sign * (zone_hours * 3_600_000 + zone_minutes * 60_000)
        }
    };
    let midnight = date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis();
    let fraction_ms = (fraction * 1000.0).trunc() as i64;
    clip(midnight + hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + fraction_ms - offset)
}

/// `TimeClip`: an instant outside what a `Date` holds is invalid.
fn clip(ms: i64) -> Option<i64> {
    let fits = (ms as f64).abs() <= MAX_TIME;
    fits.then_some(ms)
}

/// The parts of an instant: year, month (0-based), day, and the time of day in milliseconds.
#[derive(Debug, Clone, Copy)]
struct Parts {
    year: i64,
    month: i64,
    day: i64,
    time: i64,
}

fn parts(ms: i64) -> Option<Parts> {
    let date = DateTime::<Utc>::from_timestamp_millis(ms)?;
    Some(Parts {
        year: i64::from(date.year()),
        month: i64::from(date.month0()),
        day: i64::from(date.day()),
        time: i64::from(date.num_seconds_from_midnight()) * 1000
            + i64::from(date.timestamp_subsec_millis()),
    })
}

/// `MakeDate(MakeDay(year, month, day), time)`: a month or a day out of range rolls over, as
/// it does in `new Date(y, m, d)`.
fn make(year: i64, month: i64, day: i64, time: i64) -> Option<i64> {
    let year = year.checked_add(month.div_euclid(12))?;
    let month = month.rem_euclid(12);
    let first =
        NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, u32::try_from(month + 1).ok()?, 1)?;
    let offset = day - 1;
    let date = if offset >= 0 {
        first.checked_add_days(Days::new(u64::try_from(offset).ok()?))?
    } else {
        first.checked_sub_days(Days::new(offset.unsigned_abs()))?
    };
    let midnight = date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis();
    clip(midnight.checked_add(time)?)
}

/// `ToIntegerOrInfinity` of a finite sum, as `setDate` and `setMonth` apply it.
fn truncate(value: f64) -> Option<i64> {
    if !value.is_finite() || value.abs() > MAX_TIME {
        return None;
    }
    let whole = value.trunc() as i64;
    Some(whole)
}

/// `add{Minutes,Hours,Days,Weeks,Months,Years}`.
fn add_to(unit: &str, ms: i64, amount: f64) -> Option<i64> {
    if amount.is_nan() {
        return None;
    }
    match unit {
        "minutes" => add_milliseconds(ms, amount * 60_000.0),
        "hours" => add_milliseconds(ms, amount * 3_600_000.0),
        "weeks" => add_days(ms, amount * 7.0),
        "months" => add_months(ms, amount),
        "years" => add_months(ms, amount * 12.0),
        _ => add_days(ms, amount),
    }
}

fn add_milliseconds(ms: i64, amount: f64) -> Option<i64> {
    let sum = ms as f64 + amount;
    clip(truncate(sum)?)
}

fn add_days(ms: i64, amount: f64) -> Option<i64> {
    if amount == 0.0 {
        return Some(ms);
    }
    let at = parts(ms)?;
    let day = truncate(at.day as f64 + amount)?;
    make(at.year, at.month, day, at.time)
}

fn add_months(ms: i64, amount: f64) -> Option<i64> {
    if amount == 0.0 {
        return Some(ms);
    }
    let at = parts(ms)?;
    let month = truncate(at.month as f64 + amount + 1.0)?;
    // Day 0 of the month after the one wanted: the last day of the one wanted.
    let end = make(at.year, month, 0, at.time)?;
    let end_parts = parts(end)?;
    if at.day >= end_parts.day {
        return Some(end);
    }
    make(end_parts.year, end_parts.month, at.day, at.time)
}

/// `compareAsc`.
fn compare(left: i64, right: i64) -> i64 {
    (left - right).signum()
}

/// `differenceIn<unit>(later, earlier)`, or `None` when an intermediate date is invalid.
fn difference(unit: &str, later: i64, earlier: i64) -> Option<i64> {
    let result = match unit {
        "minutes" => (later - earlier) / 60_000,
        "hours" => (later - earlier) / 3_600_000,
        "weeks" => difference_in_days(later, earlier)? / 7,
        "months" => difference_in_months(later, earlier)?,
        "years" => difference_in_years(later, earlier)?,
        _ => difference_in_days(later, earlier)?,
    };
    Some(result)
}

fn difference_in_days(later: i64, earlier: i64) -> Option<i64> {
    let sign = compare(later, earlier);
    let calendar = (later.div_euclid(MS_PER_DAY) - earlier.div_euclid(MS_PER_DAY)).abs();
    let moved = later - sign * calendar * MS_PER_DAY;
    let not_full = i64::from(compare(moved, earlier) == -sign);
    Some(sign * (calendar - not_full))
}

fn difference_in_months(later: i64, earlier: i64) -> Option<i64> {
    let sign = compare(later, earlier);
    let l = parts(later)?;
    let e = parts(earlier)?;
    let difference = ((l.year - e.year) * 12 + (l.month - e.month)).abs();
    if difference < 1 {
        return Some(0);
    }
    let mut working = later;
    if l.month == 1 && l.day > 27 {
        working = make(l.year, l.month, 30, l.time)?;
    }
    let w = parts(working)?;
    let working = make(w.year, w.month - sign * difference, w.day, w.time)?;
    let mut not_full = compare(working, earlier) == -sign;
    let last_day = parts(make(l.year, l.month + 1, 0, 0)?)?.day;
    if l.day == last_day && difference == 1 && compare(later, earlier) == 1 {
        not_full = false;
    }
    Some(sign * (difference - i64::from(not_full)))
}

fn difference_in_years(later: i64, earlier: i64) -> Option<i64> {
    let sign = compare(later, earlier);
    let l = parts(later)?;
    let e = parts(earlier)?;
    let difference = (l.year - e.year).abs();
    // Both moved to 1584, a leap year, so a 29 February stays where it is.
    let partial = compare(
        make(1584, l.month, l.day, l.time)?,
        make(1584, e.month, e.day, e.time)?,
    ) == -sign;
    let result = sign * (difference - i64::from(partial));
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap_or_default()
    }

    #[test]
    fn an_iso_date_is_read_and_anything_else_is_not() {
        assert_eq!(parse_iso("2024-03-15T10:30:00Z"), Some(1_710_498_600_000));
        assert_eq!(
            parse_iso("2024-03-15T17:30:00+07:00"),
            Some(1_710_498_600_000)
        );
        assert_eq!(parse_iso("2024-03-15 10:30"), Some(1_710_498_600_000));
        assert_eq!(parse_iso("2024-03-15"), Some(1_710_460_800_000));
        assert_eq!(parse_iso("20240315"), Some(1_710_460_800_000));
        assert_eq!(parse_iso("2024-03-15T10:30:00.5Z"), Some(1_710_498_600_500));
        for bad in [
            "2024-02-30",
            "March 15",
            "2024-13-01",
            "2024-03-15T25:00",
            "",
        ] {
            assert_eq!(parse_iso(bad), None, "{bad}");
        }
    }

    #[test]
    fn the_differences_are_the_ones_of_date_fns() {
        let at = |text: &str| parse_iso(text).unwrap_or_default();
        let jan31 = at("2024-01-31T00:00:00Z");
        let feb29 = at("2024-02-29T00:00:00Z");
        assert_eq!(difference("months", feb29, jan31), Some(1));
        assert_eq!(
            difference("months", at("2024-03-30T00:00:00Z"), jan31),
            Some(1)
        );
        assert_eq!(
            difference("years", at("2025-02-28T00:00:00Z"), feb29),
            Some(0)
        );
        assert_eq!(
            difference(
                "days",
                at("2024-01-03T09:00:00Z"),
                at("2024-01-01T10:00:00Z")
            ),
            Some(1)
        );
        assert_eq!(
            difference(
                "days",
                at("2024-01-01T10:00:00Z"),
                at("2024-01-03T09:00:00Z")
            ),
            Some(-1)
        );
        assert_eq!(
            difference(
                "weeks",
                at("2024-01-15T00:00:00Z"),
                at("2024-01-01T00:00:00Z")
            ),
            Some(2)
        );
        assert_eq!(
            difference(
                "hours",
                at("2024-01-01T10:59:00Z"),
                at("2024-01-01T09:00:00Z")
            ),
            Some(1)
        );
    }

    #[test]
    fn adding_clamps_to_the_end_of_the_month() {
        let at = |text: &str| parse_iso(text).unwrap_or_default();
        let jan31 = at("2024-01-31T12:00:00Z");
        assert_eq!(
            add_to("months", jan31, 1.0),
            Some(at("2024-02-29T12:00:00Z"))
        );
        assert_eq!(
            add_to("years", at("2024-02-29T00:00:00Z"), 1.0),
            Some(at("2025-02-28T00:00:00Z"))
        );
        assert_eq!(add_to("days", jan31, 1.5), Some(at("2024-02-01T12:00:00Z")));
        assert_eq!(
            add_to("days", jan31, -31.0),
            Some(at("2023-12-31T12:00:00Z"))
        );
        assert_eq!(
            add_to("hours", jan31, 1.5),
            Some(at("2024-01-31T13:30:00Z"))
        );
    }

    #[test]
    fn the_outputs_are_the_old_objects() {
        let now = 1_710_498_605_123;
        assert_eq!(
            run(&input(json!({"operation": "now"})), now),
            json!({"success": true, "result": "2024-03-15T10:30:05Z", "timestamp": now, "iso": "2024-03-15T10:30:05.123Z"})
        );
        assert_eq!(
            run(
                &input(json!({"operation": "format", "date": "2024-03-15T10:30:00Z"})),
                now
            ),
            json!({"success": true, "result": "Mar 15, 2024, 10:30:00 AM", "timestamp": 1_710_498_600_000_i64})
        );
        assert_eq!(
            run(&input(json!({"operation": "format", "date": "soon"})), now),
            json!({"success": false, "error": "Invalid time value"})
        );
        assert_eq!(
            run(
                &input(json!({"operation": "diff", "date": "2024-01-01", "date2": "nope"})),
                now
            ),
            json!({"success": true, "result": "NaN days", "difference": null, "unit": "days"})
        );
        assert_eq!(
            run(
                &input(
                    json!({"operation": "add", "date": "2024-01-31", "amount": 1, "unit": "months"})
                ),
                now
            ),
            json!({"success": true, "result": "2024-02-29T00:00:00Z", "timestamp": 1_709_164_800_000_i64, "iso": "2024-02-29T00:00:00.000Z"})
        );
        assert_eq!(
            run(
                &input(json!({"operation": "add", "date": "2024-01-31"})),
                now
            ),
            json!({"success": false, "error": "'amount' parameter is required for add operation"})
        );
    }
}
