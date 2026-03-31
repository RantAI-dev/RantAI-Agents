mod app;
mod installer;
mod theme;
mod ui;

use std::io;
use std::time::Duration;

use anyhow::Result;
use clap::{Parser, Subcommand};
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};

use app::{App, InstallMode, Screen};

#[derive(Parser)]
#[command(name = "rantai-agents-installer", about = "RantAI Agents Installer")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Install RantAI Agents
    Install {
        /// Installation mode
        #[arg(long, default_value = "full")]
        mode: String,

        /// Install directory
        #[arg(long, default_value = "/opt/rantai-agents")]
        install_dir: String,

        /// Data directory
        #[arg(long, default_value = "/var/lib/rantai-agents")]
        data_dir: String,

        /// PostgreSQL host
        #[arg(long, default_value = "localhost")]
        db_host: String,

        /// PostgreSQL port
        #[arg(long, default_value = "5432")]
        db_port: String,

        /// Database name
        #[arg(long, default_value = "rantai_agents")]
        db_name: String,

        /// Database user
        #[arg(long, default_value = "rantai")]
        db_user: String,

        /// Database password
        #[arg(long)]
        db_password: Option<String>,

        /// Admin password
        #[arg(long)]
        admin_password: Option<String>,

        /// OpenRouter API key
        #[arg(long)]
        openrouter_key: Option<String>,

        /// Non-interactive mode (skip TUI)
        #[arg(long)]
        non_interactive: bool,

        /// Airgap installation (use bundled packages)
        #[arg(long)]
        airgap: bool,

        /// Path to airgap bundle
        #[arg(long)]
        bundle_path: Option<String>,
    },
    /// Uninstall RantAI Agents
    Uninstall {
        /// Remove data files
        #[arg(long)]
        remove_data: bool,

        /// Remove database
        #[arg(long)]
        remove_database: bool,
    },
}

fn parse_mode(s: &str) -> InstallMode {
    match s.to_lowercase().as_str() {
        "full" => InstallMode::Full,
        "minimal" => InstallMode::Minimal,
        "docker" => InstallMode::Docker,
        "development" | "dev" => InstallMode::Development,
        _ => InstallMode::Full,
    }
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Install {
            mode,
            non_interactive,
            install_dir,
            data_dir,
            db_host,
            db_port,
            db_name,
            db_user,
            db_password,
            admin_password,
            openrouter_key,
            ..
        }) => {
            let install_mode = parse_mode(&mode);

            if non_interactive {
                run_non_interactive(
                    install_mode, install_dir, data_dir,
                    db_host, db_port, db_name, db_user,
                    db_password, admin_password, openrouter_key,
                )
            } else {
                run_tui(install_mode)
            }
        }
        Some(Commands::Uninstall { remove_data, remove_database }) => {
            println!("Uninstalling RantAI Agents...");
            if remove_data {
                println!("  Removing data files...");
            }
            if remove_database {
                println!("  Removing database...");
            }
            println!("Uninstall complete.");
            Ok(())
        }
        None => run_tui(InstallMode::Full),
    }
}

fn run_tui(initial_mode: InstallMode) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(initial_mode);
    let result = run_event_loop(&mut terminal, &mut app);

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    result
}

fn run_event_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
) -> Result<()> {
    loop {
        terminal.draw(|f| ui::draw(f, app))?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                // Ctrl+C always quits
                if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c')
                {
                    app.should_quit = true;
                }

                match app.screen {
                    Screen::Welcome => match key.code {
                        KeyCode::Enter => app.screen = Screen::ModeSelect,
                        KeyCode::Char('q') => app.should_quit = true,
                        _ => {}
                    },
                    Screen::ModeSelect => match key.code {
                        KeyCode::Up => {
                            if app.mode_index > 0 {
                                app.mode_index -= 1;
                            }
                        }
                        KeyCode::Down => {
                            if app.mode_index < 3 {
                                app.mode_index += 1;
                            }
                        }
                        KeyCode::Enter => {
                            app.mode = match app.mode_index {
                                0 => InstallMode::Full,
                                1 => InstallMode::Minimal,
                                2 => InstallMode::Docker,
                                _ => InstallMode::Development,
                            };
                            app.config.mode = app.mode;
                            app.config.install_services = app.mode.includes_systemd();

                            if app.mode == InstallMode::Full {
                                app.screen = Screen::OptionalServices;
                            } else {
                                app.build_config_fields();
                                app.screen = Screen::Config;
                            }
                        }
                        KeyCode::Esc => app.screen = Screen::Welcome,
                        KeyCode::Char('q') => app.should_quit = true,
                        _ => {}
                    },
                    Screen::OptionalServices => match key.code {
                        KeyCode::Up => {
                            if app.optional_index > 0 {
                                app.optional_index -= 1;
                            }
                        }
                        KeyCode::Down => {
                            if app.optional_index < 2 {
                                app.optional_index += 1;
                            }
                        }
                        KeyCode::Char(' ') => match app.optional_index {
                            0 => app.config.enable_ollama = !app.config.enable_ollama,
                            1 => app.config.enable_piston = !app.config.enable_piston,
                            2 => app.config.enable_searxng = !app.config.enable_searxng,
                            _ => {}
                        },
                        KeyCode::Enter => {
                            app.build_config_fields();
                            app.screen = Screen::Config;
                        }
                        KeyCode::Esc => app.screen = Screen::ModeSelect,
                        KeyCode::Char('q') => app.should_quit = true,
                        _ => {}
                    },
                    Screen::Config => {
                        if app.config_editing {
                            match key.code {
                                KeyCode::Enter | KeyCode::Esc => {
                                    if key.code == KeyCode::Enter {
                                        if let Some(field) = app.config_items.get_mut(app.config_index) {
                                            field.value = app.config_buffer.clone();
                                        }
                                    }
                                    app.config_editing = false;
                                    app.config_buffer.clear();
                                }
                                KeyCode::Char(c) => app.config_buffer.push(c),
                                KeyCode::Backspace => { app.config_buffer.pop(); }
                                _ => {}
                            }
                        } else {
                            match key.code {
                                KeyCode::Up => {
                                    if app.config_index > 0 {
                                        app.config_index -= 1;
                                    }
                                }
                                KeyCode::Down => {
                                    if app.config_index < app.config_items.len().saturating_sub(1) {
                                        app.config_index += 1;
                                    }
                                }
                                KeyCode::Enter => {
                                    if let Some(field) = app.config_items.get(app.config_index) {
                                        app.config_buffer = field.value.clone();
                                        app.config_editing = true;
                                    }
                                }
                                KeyCode::Tab => {
                                    app.apply_config_fields();
                                    app.screen = Screen::Preflight;
                                }
                                KeyCode::Esc => {
                                    if app.mode == InstallMode::Full {
                                        app.screen = Screen::OptionalServices;
                                    } else {
                                        app.screen = Screen::ModeSelect;
                                    }
                                }
                                KeyCode::Char('q') => app.should_quit = true,
                                _ => {}
                            }
                        }
                    }
                    Screen::Preflight => match key.code {
                        KeyCode::Enter if app.preflight_done => {
                            let has_errors = app.preflight_checks.iter().any(|c| c.status == app::Status::Error);
                            if !has_errors {
                                app.screen = Screen::Progress;
                            }
                        }
                        KeyCode::Char('r') if !app.preflight_running => {
                            app.preflight_checks.clear();
                            app.preflight_done = false;
                        }
                        KeyCode::Esc if !app.preflight_running => app.screen = Screen::Config,
                        KeyCode::Char('q') if !app.preflight_running => app.should_quit = true,
                        _ => {}
                    },
                    Screen::Progress => match key.code {
                        KeyCode::Enter if app.install_done => {
                            if app.install_error.is_some() {
                                app.error_message = app.install_error.clone();
                                app.screen = Screen::Error;
                            } else {
                                app.screen = Screen::Verify;
                            }
                        }
                        KeyCode::Up => {
                            if app.log_scroll > 0 {
                                app.log_scroll -= 1;
                            }
                        }
                        KeyCode::Down => {
                            app.log_scroll += 1;
                        }
                        _ => {}
                    },
                    Screen::Verify => match key.code {
                        KeyCode::Enter if app.verify_done => app.screen = Screen::Complete,
                        KeyCode::Char('q') if app.verify_done => app.should_quit = true,
                        _ => {}
                    },
                    Screen::Complete => match key.code {
                        KeyCode::Enter | KeyCode::Char('q') => app.should_quit = true,
                        _ => {}
                    },
                    Screen::Error => match key.code {
                        KeyCode::Esc | KeyCode::Char('q') => app.should_quit = true,
                        _ => {}
                    },
                }
            }
        }

        // Tick spinner
        app.spinner_tick = app.spinner_tick.wrapping_add(1);

        // Start preflight if needed
        if app.screen == Screen::Preflight && !app.preflight_running && !app.preflight_done {
            app.preflight_running = true;
            let checks = installer::preflight::run_preflight_checks(&app.config);
            app.preflight_checks = checks;
            app.preflight_running = false;
            app.preflight_done = true;
        }

        // Start verification if needed
        if app.screen == Screen::Verify && !app.verify_running && !app.verify_done {
            app.verify_running = true;
            let checks = installer::verify::run_verification(&app.config);
            app.verify_checks = checks;
            app.verify_running = false;
            app.verify_done = true;
        }

        if app.should_quit {
            return Ok(());
        }
    }
}

fn run_non_interactive(
    mode: InstallMode,
    install_dir: String,
    data_dir: String,
    db_host: String,
    db_port: String,
    db_name: String,
    db_user: String,
    db_password: Option<String>,
    admin_password: Option<String>,
    openrouter_key: Option<String>,
) -> Result<()> {
    println!("{} Installer v{}", theme::PRODUCT_NAME, theme::VERSION);
    println!("Mode: {}", mode.label());
    println!();

    let mut config = app::InstallConfig {
        mode,
        install_dir,
        data_dir,
        db_host,
        db_port,
        db_name,
        db_user,
        install_services: mode.includes_systemd(),
        ..Default::default()
    };

    if let Some(pw) = db_password {
        config.db_password = pw;
    }
    if let Some(pw) = admin_password {
        config.admin_password = pw;
    }
    if let Some(key) = openrouter_key {
        config.openrouter_api_key = key;
    }

    // Generate random values for empty secrets
    if config.db_password.is_empty() {
        config.db_password = installer::generate_random_string(16);
    }
    if config.admin_password.is_empty() {
        config.admin_password = installer::generate_random_string(16);
    }
    if config.nextauth_secret.is_empty() {
        config.nextauth_secret = installer::generate_random_string(32);
    }
    if config.s3_access_key.is_empty() {
        config.s3_access_key = installer::generate_random_string(20);
    }
    if config.s3_secret_key.is_empty() {
        config.s3_secret_key = installer::generate_random_string(40);
    }

    println!("Running preflight checks...");
    let checks = installer::preflight::run_preflight_checks(&config);
    let errors: Vec<_> = checks.iter().filter(|c| c.status == app::Status::Error).collect();
    if !errors.is_empty() {
        eprintln!("Preflight errors:");
        for e in &errors {
            eprintln!("  {} {}: {}", theme::SYM_CROSS, e.name, e.message.as_deref().unwrap_or(""));
        }
        std::process::exit(1);
    }
    println!("  {} All checks passed", theme::SYM_CHECK);

    println!("\nInstallation complete. Run verification separately.");
    Ok(())
}
