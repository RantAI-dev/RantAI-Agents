use clap::Parser;
use rantai_agents_installer::cli::Cli;

#[test]
fn parses_update() {
    let cli = Cli::try_parse_from(["rantai-agents", "update"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Update { .. }));
}

#[test]
fn parses_doctor() {
    let cli = Cli::try_parse_from(["rantai-agents", "doctor"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Doctor));
}

#[test]
fn parses_status() {
    let cli = Cli::try_parse_from(["rantai-agents", "status"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Status));
}

#[test]
fn parses_version() {
    let cli = Cli::try_parse_from(["rantai-agents", "version"]).unwrap();
    assert!(matches!(cli.command, rantai_agents_installer::cli::Command::Version));
}

#[test]
fn update_takes_branch_flag() {
    let cli = Cli::try_parse_from(["rantai-agents", "update", "--branch", "main"]).unwrap();
    if let rantai_agents_installer::cli::Command::Update { branch } = cli.command {
        assert_eq!(branch.as_deref(), Some("main"));
    } else {
        panic!("expected Update");
    }
}
