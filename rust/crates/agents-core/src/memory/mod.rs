//! Long-term user memory: the profile (facts, preferences, summary), its merge and forget
//! rules, the memory tools' inputs and results, and how the profile is written into the
//! system prompt.
//!
//! Ported from `src/lib/memory/`. The functions here are pure: no database, no clock and no
//! randomness. The caller passes the time and the ids in, so the same input always gives
//! the same output.
//!
//! Working memory, semantic recall and the regex extractors are out of scope for this
//! port: the profile changes only through the memory tools and the summary. The
//! differences are in `docs/port/differences.md`.

pub mod fact_keys;
pub mod profile;
pub mod prompt;
pub mod text;
pub mod time;
pub mod tools;
pub mod types;
