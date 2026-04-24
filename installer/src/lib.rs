// Library entry point for integration tests.
// Re-exports the public modules so tests can reference them via the crate name.
#![allow(
    dead_code,
    clippy::large_enum_variant,
    clippy::vec_init_then_push,
    clippy::if_same_then_else,
    clippy::single_match
)]

pub mod app;
pub mod installer;
pub mod theme;
pub mod ui;
pub mod validate;
