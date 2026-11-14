//! How the API prints an instant.
//!
//! RFC 3339 in UTC with exactly three decimals (`2026-11-11T08:30:00.000Z`), the format the
//! conventions ask for and the one `JSON.stringify` writes for a JavaScript date.

use chrono::NaiveDateTime;

/// The instant as the API prints it.
#[must_use]
pub fn iso(t: NaiveDateTime) -> String {
    t.and_utc().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// The instant as the API prints it, or `None` when there is none.
#[must_use]
pub fn iso_opt(t: Option<NaiveDateTime>) -> Option<String> {
    t.map(iso)
}
