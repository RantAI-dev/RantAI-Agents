//! `rantai-agents` CLI surface. See `installer/src/bin/rantai-agents.rs` for
//! the binary entry; this module holds the clap definitions + dispatch logic
//! so the CLI can be tested in isolation.

use clap::{Parser, Subcommand};
use std::process::ExitCode;

#[derive(Debug, Parser)]
#[command(name = "rantai-agents", version, about = "RantAI Agents control CLI")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Update RantAI Agents to the latest version.
    Update {
        /// Git branch to update to. Defaults to "main" or RANTAI_AGENTS_BRANCH.
        #[arg(long)]
        branch: Option<String>,
    },
    /// Run health checks against the installed system.
    Doctor,
    /// Print install status (profile, version, services).
    Status,
    /// Print installer version + git sha of installed code.
    Version,
}

pub fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Update { branch } => crate::cli::update::run(branch.as_deref()),
        Command::Doctor => crate::cli::doctor::run(),
        Command::Status => crate::cli::status::run(),
        Command::Version => crate::cli::version::run(),
    }
}

pub mod doctor;
pub mod status;
pub mod update;
pub mod version;
