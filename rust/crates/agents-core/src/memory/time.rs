//! The timestamps the profile rows hold.
//!
//! Every row is written by the app itself, so the text is always an ISO-8601 instant
//! (`2026-11-14T08:30:00.000Z`). The port parses that format and nothing else: JavaScript's
//! `new Date(text)` also accepts loose formats ("2026", "2026-1-1", "Jan 1 2026"), and
//! those are treated here as "no timestamp", which is what the old code did with a value
//! `Date` could not read.
//!
//! A date-time without a zone is read as UTC. JavaScript reads it as local time; the oracle
//! runs with `TZ=UTC`, so the two agree there, and the profile rows always carry `Z`.

const MILLIS_PER_DAY: i64 = 86_400_000;

/// Parse an ISO-8601 instant into milliseconds since the Unix epoch.
#[must_use]
pub fn parse_iso_millis(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    let year = digits(text.get(0..4)?)?;
    if bytes.get(4) != Some(&b'-') {
        return None;
    }
    let month = digits(text.get(5..7)?)?;
    if bytes.get(7) != Some(&b'-') {
        return None;
    }
    let day = digits(text.get(8..10)?)?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut cursor = 10usize;
    let mut hour = 0i64;
    let mut minute = 0i64;
    let mut second = 0i64;
    let mut millis = 0i64;
    let mut offset_minutes = 0i64;

    if bytes.len() > cursor {
        match bytes.get(cursor) {
            Some(b'T') | Some(b't') | Some(b' ') => {}
            _ => return None,
        }
        cursor += 1;
        hour = digits(text.get(cursor..cursor + 2)?)?;
        cursor += 2;
        if bytes.get(cursor) != Some(&b':') {
            return None;
        }
        cursor += 1;
        minute = digits(text.get(cursor..cursor + 2)?)?;
        cursor += 2;
        if bytes.get(cursor) == Some(&b':') {
            cursor += 1;
            second = digits(text.get(cursor..cursor + 2)?)?;
            cursor += 2;
            if bytes.get(cursor) == Some(&b'.') {
                cursor += 1;
                let start = cursor;
                while bytes.get(cursor).is_some_and(u8::is_ascii_digit) {
                    cursor += 1;
                }
                let fraction = text.get(start..cursor)?;
                let mut fraction_millis = fraction.to_owned();
                fraction_millis.truncate(3);
                while fraction_millis.len() < 3 {
                    fraction_millis.push('0');
                }
                millis = digits(&fraction_millis)?;
            }
        }
        match bytes.get(cursor) {
            Some(b'Z') | Some(b'z') => cursor += 1,
            Some(b'+') | Some(b'-') => {
                let sign = if bytes.get(cursor) == Some(&b'-') {
                    -1
                } else {
                    1
                };
                cursor += 1;
                let offset_hour = digits(text.get(cursor..cursor + 2)?)?;
                cursor += 2;
                let offset_minute = match bytes.get(cursor) {
                    Some(b':') => {
                        cursor += 1;
                        let value = digits(text.get(cursor..cursor + 2)?)?;
                        cursor += 2;
                        value
                    }
                    Some(b) if b.is_ascii_digit() => {
                        let value = digits(text.get(cursor..cursor + 2)?)?;
                        cursor += 2;
                        value
                    }
                    _ => 0,
                };
                offset_minutes = sign * (offset_hour * 60 + offset_minute);
            }
            None => {}
            Some(_) => return None,
        }
    }
    if cursor != bytes.len() {
        return None;
    }
    if hour > 24 || minute > 59 || second > 59 || (hour == 24 && (minute != 0 || second != 0)) {
        return None;
    }

    let days = days_from_civil(year, month, day);
    Some(
        days * MILLIS_PER_DAY + hour * 3_600_000 + minute * 60_000 + second * 1_000 + millis
            - offset_minutes * 60_000,
    )
}

/// The UTC date of an instant, the way `new Date(t).toISOString().slice(0, 10)` prints it.
#[must_use]
pub fn iso_date(millis: i64) -> String {
    let (year, month, day) = civil_from_days(millis.div_euclid(MILLIS_PER_DAY));
    format!("{year:04}-{month:02}-{day:02}")
}

fn digits(text: &str) -> Option<i64> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse::<i64>().ok()
}

/// Days since the Unix epoch for a civil date. The day may run past the end of the month,
/// the way JavaScript's `MakeDay` does ("2026-02-30" is the 2nd of March there).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_position = (month + 9) % 12;
    let day_of_year = (153 * month_position + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// The civil date for a number of days since the Unix epoch.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_position = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_position + 2) / 5 + 1;
    let month = if month_position < 10 {
        month_position + 3
    } else {
        month_position - 9
    };
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_formats_the_rows_hold() {
        assert_eq!(parse_iso_millis("2026-01-01"), Some(1_767_225_600_000));
        assert_eq!(
            parse_iso_millis("2026-01-01T00:00:00.000Z"),
            Some(1_767_225_600_000)
        );
        assert_eq!(
            parse_iso_millis("2026-01-01T00:00:00.123Z"),
            Some(1_767_225_600_123)
        );
        assert_eq!(
            parse_iso_millis("2026-01-01T00:00:00+07:00"),
            Some(1_767_200_400_000)
        );
    }

    #[test]
    fn rejects_what_javascript_rejects() {
        assert_eq!(parse_iso_millis("2026-13-01"), None);
        assert_eq!(parse_iso_millis("2026-01-32"), None);
        assert_eq!(parse_iso_millis("2026-01-01T25:00:00Z"), None);
        assert_eq!(parse_iso_millis("2026-01-01T23:60:00Z"), None);
        assert_eq!(parse_iso_millis("not a date"), None);
        assert_eq!(parse_iso_millis(""), None);
    }

    #[test]
    fn a_day_past_the_end_of_the_month_rolls_over_like_javascript() {
        assert_eq!(
            parse_iso_millis("2026-02-30"),
            parse_iso_millis("2026-03-02")
        );
    }

    #[test]
    fn prints_the_utc_date() {
        assert_eq!(iso_date(1_767_225_600_000), "2026-01-01");
        assert_eq!(iso_date(0), "1970-01-01");
    }
}
