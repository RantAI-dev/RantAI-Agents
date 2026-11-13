//! Pure domain logic for RantAI Agents: no I/O, no async, no clock.
//!
//! Callers pass in time and ids. `tests/boundary.rs` fails the build if this crate (or
//! `agents-contracts`) gains a dependency that does I/O.

pub mod assistant;
pub mod memory;
pub mod org;
pub mod prompt;
pub mod validation;
