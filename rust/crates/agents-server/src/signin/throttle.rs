//! The brute-force throttle of the password sign-in: attempts per email and per client address.
//!
//! **In memory, per instance.** The counters live in this process, so with N instances behind a
//! load balancer an attacker gets up to N times the limit, and a restart forgets them. That is a
//! deliberate trade: no table and no migration for S2, and the per-email limit still makes a
//! guessing attack on one account hopeless (5 tries per 15 minutes per instance). Moving the
//! counters to Postgres or Redis changes only this file.
//!
//! An attempt is counted when it *starts*, under the lock, so concurrent attempts cannot all pass
//! the check before any of them fails (`tests/signin_password.rs` fires them at once). A success
//! clears the email's counter and gives the address its attempt back, so an office behind one
//! address is limited by its failures only.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

/// The limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ThrottleLimits {
    pub per_email: u32,
    pub per_address: u32,
    pub window: Duration,
}

impl Default for ThrottleLimits {
    fn default() -> Self {
        Self {
            per_email: 5,
            per_address: 30,
            window: Duration::from_secs(15 * 60),
        }
    }
}

/// The most keys kept before expired ones are swept, so a flood of addresses cannot grow the map
/// without bound.
const SWEEP_AT: usize = 10_000;

#[derive(Debug, Clone, Copy)]
struct Bucket {
    count: u32,
    started: Instant,
}

#[derive(Debug, Default)]
pub struct Throttle {
    limits: ThrottleLimits,
    buckets: Mutex<HashMap<String, Bucket>>,
}

/// An attempt that was let through. Report how it went with [`Throttle::succeeded`].
#[derive(Debug)]
#[must_use]
pub struct Attempt {
    email_key: String,
    address_key: String,
}

impl Throttle {
    #[must_use]
    pub fn new(limits: ThrottleLimits) -> Self {
        Self {
            limits,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// Counts an attempt for `email` from `address`, or refuses it with the seconds until the
    /// window that refused it ends.
    pub fn begin(&self, email: &str, address: &str) -> Result<Attempt, u64> {
        let now = Instant::now();
        let window = self.limits.window;
        let email_key = format!("e:{}", email.trim().to_lowercase());
        let address_key = format!("a:{address}");
        let mut buckets = self.buckets.lock().unwrap_or_else(PoisonError::into_inner);
        if buckets.len() >= SWEEP_AT {
            buckets.retain(|_, b| now.duration_since(b.started) < window);
        }
        let mut refused: Option<u64> = None;
        for (key, limit) in [
            (&email_key, self.limits.per_email),
            (&address_key, self.limits.per_address),
        ] {
            let bucket = buckets.entry(key.clone()).or_insert(Bucket {
                count: 0,
                started: now,
            });
            if now.duration_since(bucket.started) >= window {
                *bucket = Bucket {
                    count: 0,
                    started: now,
                };
            }
            if bucket.count >= limit {
                let left = window.saturating_sub(now.duration_since(bucket.started));
                let seconds = left.as_secs().max(1);
                refused = Some(refused.map_or(seconds, |r| r.max(seconds)));
            }
        }
        if let Some(seconds) = refused {
            return Err(seconds);
        }
        for key in [&email_key, &address_key] {
            if let Some(bucket) = buckets.get_mut(key) {
                bucket.count = bucket.count.saturating_add(1);
            }
        }
        Ok(Attempt {
            email_key,
            address_key,
        })
    }

    /// The attempt signed in: the email starts over and the address gets its attempt back.
    pub fn succeeded(&self, attempt: Attempt) {
        let mut buckets = self.buckets.lock().unwrap_or_else(PoisonError::into_inner);
        buckets.remove(&attempt.email_key);
        if let Some(bucket) = buckets.get_mut(&attempt.address_key) {
            bucket.count = bucket.count.saturating_sub(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn throttle() -> Throttle {
        Throttle::new(ThrottleLimits {
            per_email: 2,
            per_address: 3,
            window: Duration::from_secs(60),
        })
    }

    #[test]
    fn an_email_is_refused_after_its_limit_whatever_its_case() {
        let t = throttle();
        assert!(t.begin("Ada@x.test", "1").is_ok());
        assert!(t.begin("ada@x.test", "2").is_ok());
        assert!(t.begin(" ADA@x.test", "3").is_err());
        // Another email from a fresh address is not affected.
        assert!(t.begin("bob@x.test", "4").is_ok());
    }

    #[test]
    fn an_address_is_refused_after_its_limit_across_emails() {
        let t = throttle();
        for email in ["a", "b", "c"] {
            assert!(t.begin(email, "9").is_ok());
        }
        assert!(t.begin("d", "9").is_err());
    }

    #[test]
    fn a_success_resets_the_email_and_returns_the_address_attempt() {
        let t = throttle();
        let _ = t.begin("a", "9");
        if let Ok(attempt) = t.begin("a", "9") {
            t.succeeded(attempt);
        }
        assert!(t.begin("a", "9").is_ok());
        assert!(t.begin("a", "9").is_ok());
        assert!(t.begin("a", "9").is_err());
    }
}
