use std::collections::VecDeque;

/// TUI screens in order of the installation flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Welcome,
    ModeSelect,
    OptionalServices,
    Config,
    Preflight,
    Progress,
    Verify,
    Complete,
    Error,
}

/// Installation mode selected by the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallMode {
    /// All services via Docker, app natively via systemd+Bun
    Full,
    /// External services (user provides connection strings), app native
    Minimal,
    /// Everything via docker compose (simplest path)
    Docker,
    /// Docker services, app via `bun run dev` (no systemd)
    Development,
}

impl InstallMode {
    pub fn label(&self) -> &str {
        match self {
            Self::Full => "Full",
            Self::Minimal => "Minimal",
            Self::Docker => "Docker",
            Self::Development => "Development",
        }
    }

    pub fn description(&self) -> &str {
        match self {
            Self::Full => {
                "All services via Docker, app runs natively with systemd. Best for production."
            }
            Self::Minimal => {
                "Bring your own services (PostgreSQL, SurrealDB, etc.). App runs natively."
            }
            Self::Docker => "Everything in Docker via docker compose. Simplest setup.",
            Self::Development => {
                "Services in Docker, app runs with bun dev. For local development."
            }
        }
    }

    pub fn includes_docker_services(&self) -> bool {
        matches!(self, Self::Full | Self::Docker | Self::Development)
    }

    pub fn includes_systemd(&self) -> bool {
        matches!(self, Self::Full | Self::Minimal)
    }

    pub fn includes_native_app(&self) -> bool {
        matches!(self, Self::Full | Self::Minimal | Self::Development)
    }
}

/// Installation phases executed in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Preflight,
    Dependencies,
    Infrastructure,
    ApplicationSetup,
    Configuration,
    Database,
    Services,
    Verification,
}

impl Phase {
    pub fn label(&self) -> &str {
        match self {
            Self::Preflight => "Preflight Checks",
            Self::Dependencies => "Install Dependencies",
            Self::Infrastructure => "Start Infrastructure",
            Self::ApplicationSetup => "Application Setup",
            Self::Configuration => "Generate Configuration",
            Self::Database => "Database Migrations",
            Self::Services => "Install Services",
            Self::Verification => "Verification",
        }
    }

    pub fn index(&self) -> usize {
        match self {
            Self::Preflight => 0,
            Self::Dependencies => 1,
            Self::Infrastructure => 2,
            Self::ApplicationSetup => 3,
            Self::Configuration => 4,
            Self::Database => 5,
            Self::Services => 6,
            Self::Verification => 7,
        }
    }

    pub const ALL: &'static [Phase] = &[
        Phase::Preflight,
        Phase::Dependencies,
        Phase::Infrastructure,
        Phase::ApplicationSetup,
        Phase::Configuration,
        Phase::Database,
        Phase::Services,
        Phase::Verification,
    ];

    pub const COUNT: usize = 8;
}

/// Status of a check item or phase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pending,
    Running,
    Success,
    Warning,
    Error,
    Skipped,
}

/// Log severity levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Success,
    Warning,
    Error,
}

/// A single log entry.
#[derive(Debug, Clone)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
}

/// A preflight/verification check item.
#[derive(Debug, Clone)]
pub struct CheckItem {
    pub name: String,
    pub status: Status,
    pub message: Option<String>,
}

/// Full installation configuration collected from the user.
#[derive(Debug, Clone)]
pub struct InstallConfig {
    // Paths
    pub install_dir: String,
    pub data_dir: String,

    // PostgreSQL
    pub db_host: String,
    pub db_port: String,
    pub db_name: String,
    pub db_user: String,
    pub db_password: String,

    // SurrealDB
    pub surrealdb_url: String,
    pub surrealdb_user: String,
    pub surrealdb_pass: String,

    // S3 Storage (RustFS)
    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_bucket: String,

    // Optional services
    pub ollama_url: String,
    pub piston_url: String,
    pub searxng_url: String,

    // Auth
    pub nextauth_secret: String,
    pub nextauth_url: String,

    // LLM
    pub openrouter_api_key: String,

    // Admin
    pub admin_email: String,
    pub admin_password: String,

    // Mode & flags
    pub mode: InstallMode,
    pub install_services: bool,
    pub enable_ollama: bool,
    pub enable_piston: bool,
    pub enable_searxng: bool,
}

impl Default for InstallConfig {
    fn default() -> Self {
        Self {
            install_dir: "/opt/rantai-agents".into(),
            data_dir: "/var/lib/rantai-agents".into(),

            db_host: "localhost".into(),
            db_port: "5432".into(),
            db_name: "rantai_agents".into(),
            db_user: "rantai".into(),
            db_password: String::new(),

            surrealdb_url: "ws://localhost:8000/rpc".into(),
            surrealdb_user: "root".into(),
            surrealdb_pass: "root".into(),

            s3_endpoint: "http://localhost:9000".into(),
            s3_access_key: String::new(),
            s3_secret_key: String::new(),
            s3_bucket: "rantai-agents".into(),

            ollama_url: "http://localhost:11434".into(),
            piston_url: "http://localhost:2000".into(),
            searxng_url: "http://localhost:8080/search".into(),

            nextauth_secret: String::new(),
            nextauth_url: "http://localhost:3000".into(),

            openrouter_api_key: String::new(),

            admin_email: "admin@rantai.local".into(),
            admin_password: String::new(),

            mode: InstallMode::Full,
            install_services: true,
            enable_ollama: true,
            enable_piston: true,
            enable_searxng: true,
        }
    }
}

/// Main application state for the TUI.
pub struct App {
    pub screen: Screen,
    pub mode: InstallMode,
    pub config: InstallConfig,

    // Mode selection
    pub mode_index: usize,

    // Optional services toggles
    pub optional_index: usize,

    // Config screen
    pub config_items: Vec<ConfigField>,
    pub config_index: usize,
    pub config_editing: bool,
    pub config_buffer: String,

    // Preflight
    pub preflight_checks: Vec<CheckItem>,
    pub preflight_running: bool,
    pub preflight_done: bool,

    // Progress
    pub current_phase: Option<Phase>,
    pub phase_statuses: Vec<Status>,
    pub logs: VecDeque<LogEntry>,
    pub log_scroll: usize,
    pub install_done: bool,
    pub install_error: Option<String>,

    // Verify
    pub verify_checks: Vec<CheckItem>,
    pub verify_running: bool,
    pub verify_done: bool,

    // Global
    pub should_quit: bool,
    pub error_message: Option<String>,
    pub spinner_tick: usize,
}

/// A configuration field editable in the config screen.
#[derive(Debug, Clone)]
pub struct ConfigField {
    pub key: String,
    pub label: String,
    pub value: String,
    pub secret: bool,
}

impl App {
    pub fn new(mode: InstallMode) -> Self {
        let config = InstallConfig {
            mode,
            install_services: mode.includes_systemd(),
            ..Default::default()
        };

        Self {
            screen: Screen::Welcome,
            mode,
            config,
            mode_index: 0,
            optional_index: 0,
            config_items: Vec::new(),
            config_index: 0,
            config_editing: false,
            config_buffer: String::new(),
            preflight_checks: Vec::new(),
            preflight_running: false,
            preflight_done: false,
            current_phase: None,
            phase_statuses: vec![Status::Pending; Phase::COUNT],
            logs: VecDeque::with_capacity(500),
            log_scroll: 0,
            install_done: false,
            install_error: None,
            verify_checks: Vec::new(),
            verify_running: false,
            verify_done: false,
            should_quit: false,
            error_message: None,
            spinner_tick: 0,
        }
    }

    pub fn add_log(&mut self, level: LogLevel, message: impl Into<String>) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        self.logs.push_back(LogEntry {
            timestamp,
            level,
            message: message.into(),
        });
        if self.logs.len() > 500 {
            self.logs.pop_front();
        }
    }

    pub fn build_config_fields(&mut self) {
        let c = &self.config;
        let mut fields = vec![
            ConfigField {
                key: "install_dir".into(),
                label: "Install Directory".into(),
                value: c.install_dir.clone(),
                secret: false,
            },
            ConfigField {
                key: "data_dir".into(),
                label: "Data Directory".into(),
                value: c.data_dir.clone(),
                secret: false,
            },
        ];

        if !self.mode.includes_docker_services() || self.mode == InstallMode::Minimal {
            fields.extend([
                ConfigField {
                    key: "db_host".into(),
                    label: "PostgreSQL Host".into(),
                    value: c.db_host.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "db_port".into(),
                    label: "PostgreSQL Port".into(),
                    value: c.db_port.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "db_name".into(),
                    label: "Database Name".into(),
                    value: c.db_name.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "db_user".into(),
                    label: "Database User".into(),
                    value: c.db_user.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "db_password".into(),
                    label: "Database Password".into(),
                    value: c.db_password.clone(),
                    secret: true,
                },
                ConfigField {
                    key: "surrealdb_url".into(),
                    label: "SurrealDB URL".into(),
                    value: c.surrealdb_url.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "s3_endpoint".into(),
                    label: "S3 Endpoint".into(),
                    value: c.s3_endpoint.clone(),
                    secret: false,
                },
            ]);
        }

        fields.extend([
            ConfigField {
                key: "nextauth_url".into(),
                label: "App URL".into(),
                value: c.nextauth_url.clone(),
                secret: false,
            },
            ConfigField {
                key: "openrouter_api_key".into(),
                label: "OpenRouter API Key".into(),
                value: c.openrouter_api_key.clone(),
                secret: true,
            },
            ConfigField {
                key: "admin_email".into(),
                label: "Admin Email".into(),
                value: c.admin_email.clone(),
                secret: false,
            },
            ConfigField {
                key: "admin_password".into(),
                label: "Admin Password".into(),
                value: c.admin_password.clone(),
                secret: true,
            },
        ]);

        self.config_items = fields;
    }

    pub fn apply_config_fields(&mut self) {
        for field in &self.config_items {
            match field.key.as_str() {
                "install_dir" => self.config.install_dir = field.value.clone(),
                "data_dir" => self.config.data_dir = field.value.clone(),
                "db_host" => self.config.db_host = field.value.clone(),
                "db_port" => self.config.db_port = field.value.clone(),
                "db_name" => self.config.db_name = field.value.clone(),
                "db_user" => self.config.db_user = field.value.clone(),
                "db_password" => self.config.db_password = field.value.clone(),
                "surrealdb_url" => self.config.surrealdb_url = field.value.clone(),
                "s3_endpoint" => self.config.s3_endpoint = field.value.clone(),
                "nextauth_url" => self.config.nextauth_url = field.value.clone(),
                "openrouter_api_key" => self.config.openrouter_api_key = field.value.clone(),
                "admin_email" => self.config.admin_email = field.value.clone(),
                "admin_password" => self.config.admin_password = field.value.clone(),
                _ => {}
            }
        }
    }

    pub fn screen_step(&self) -> usize {
        match self.screen {
            Screen::Welcome => 1,
            Screen::ModeSelect => 2,
            Screen::OptionalServices => 3,
            Screen::Config => 4,
            Screen::Preflight => 5,
            Screen::Progress => 6,
            Screen::Verify => 7,
            Screen::Complete => 8,
            Screen::Error => 0,
        }
    }
}
