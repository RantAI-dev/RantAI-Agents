use std::collections::VecDeque;

/// TUI screens in order of the installation flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Welcome,
    ProfileSelect,
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

/// Orthogonal axis to `InstallMode`. Profile decides WHAT is installed.
/// Mode decides HOW. They compose.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallProfile {
    /// Next.js app + infra. Points at external sidecars via env URLs.
    /// Pick this when your GPU box is a separate machine.
    AppOnly,
    /// MinerU + rerank sidecars on a GPU box. No app, no infra.
    /// Pick this on the GPU box when the app lives elsewhere.
    SidecarOnly,
    /// App + infra + sidecars on one machine. Dev or small deployments.
    AllInOne,
}

impl InstallProfile {
    pub fn label(&self) -> &'static str {
        match self {
            Self::AppOnly => "App Only",
            Self::SidecarOnly => "Sidecars Only (GPU box)",
            Self::AllInOne => "All-in-one",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Self::AppOnly => {
                "Install the Next.js app, PostgreSQL, SurrealDB, and object store on this machine. \
                 You provide URLs pointing at MinerU and rerank sidecars running on a separate GPU box."
            }
            Self::SidecarOnly => {
                "Install only the GPU-backed sidecars (MinerU OCR + Nemotron rerank) on this machine. \
                 Requires an NVIDIA GPU with ≥8 GB VRAM. The URLs printed at the end go in the app server's .env."
            }
            Self::AllInOne => {
                "Install everything on this machine. Suitable for development and small single-box \
                 deployments. Requires an NVIDIA GPU if you want the on-prem OCR / rerank path."
            }
        }
    }

    pub fn includes_app(&self) -> bool {
        matches!(self, Self::AppOnly | Self::AllInOne)
    }

    pub fn includes_sidecars(&self) -> bool {
        matches!(self, Self::SidecarOnly | Self::AllInOne)
    }
}

/// Which rerank implementation to use. Matches KB_RERANK_PROVIDER env.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RerankProvider {
    /// LLM-as-reranker via OpenRouter chat completions.
    Openrouter,
    /// Self-hosted cross-encoder via the services/rerank-server/ sidecar (Nemotron 1B v2 default).
    Vllm,
    /// Cohere SaaS rerank (api.cohere.com/v2/rerank).
    Cohere,
}

impl RerankProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Openrouter => "openrouter",
            Self::Vllm => "vllm",
            Self::Cohere => "cohere",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Openrouter => "OpenRouter (LLM-as-reranker)",
            Self::Vllm => "Self-hosted (Nemotron via sidecar)",
            Self::Cohere => "Cohere SaaS",
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Self::Openrouter => "openai/gpt-4.1-nano",
            Self::Vllm => "nvidia/llama-nemotron-rerank-1b-v2",
            Self::Cohere => "rerank-v4.0-pro",
        }
    }
}

/// Sidecar-facing config. Persisted into .env as KB_EXTRACT_MINERU_BASE_URL +
/// KB_RERANK_* when profile includes the app, and used to drive systemd unit
/// install when profile includes sidecars.
#[derive(Debug, Clone)]
pub struct SidecarConfig {
    // MinerU
    pub mineru_enabled: bool,
    pub mineru_base_url: String,
    pub mineru_port: u16,

    // Rerank
    pub rerank_enabled: bool,
    pub rerank_provider: RerankProvider,
    pub rerank_base_url: String,
    pub rerank_port: u16,
    pub rerank_model: String,
    pub rerank_api_key: String,

    // GPU + Python (only used when profile includes sidecars)
    pub gpu_device_id: u32,
    pub python_venv_dir: String,
    pub hf_cache_dir: String,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
            mineru_enabled: true,
            mineru_base_url: "http://localhost:8100".into(),
            mineru_port: 8100,

            rerank_enabled: true,
            rerank_provider: RerankProvider::Vllm,
            rerank_base_url: "http://localhost:8200".into(),
            rerank_port: 8200,
            rerank_model: RerankProvider::Vllm.default_model().to_owned(),
            rerank_api_key: String::new(),

            gpu_device_id: 0,
            python_venv_dir: "/home/rantai-agents/vllm-env".into(),
            hf_cache_dir: "/home/rantai-agents/.cache/huggingface".into(),
        }
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
    SidecarInstall,
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
            Self::SidecarInstall => "Install GPU Sidecars",
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
            Self::SidecarInstall => 7,
            Self::Verification => 8,
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
        Phase::SidecarInstall,
        Phase::Verification,
    ];

    pub const COUNT: usize = 9;
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

    // Profile + sidecar config
    pub profile: InstallProfile,
    pub sidecar: SidecarConfig,

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

            profile: InstallProfile::AllInOne,
            sidecar: SidecarConfig::default(),

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

    // Profile selection
    pub profile_index: usize,

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
            profile_index: 0,
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

        let profile_app = c.profile.includes_app();
        let profile_sidecars = c.profile.includes_sidecars();

        if profile_app && (!self.mode.includes_docker_services() || self.mode == InstallMode::Minimal) {
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
                    label: "PostgreSQL DB Name".into(),
                    value: c.db_name.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "db_user".into(),
                    label: "PostgreSQL User".into(),
                    value: c.db_user.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "db_password".into(),
                    label: "PostgreSQL Password (blank = auto)".into(),
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
                    key: "surrealdb_user".into(),
                    label: "SurrealDB User".into(),
                    value: c.surrealdb_user.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "surrealdb_pass".into(),
                    label: "SurrealDB Password".into(),
                    value: c.surrealdb_pass.clone(),
                    secret: true,
                },
                ConfigField {
                    key: "s3_endpoint".into(),
                    label: "S3 Endpoint".into(),
                    value: c.s3_endpoint.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "s3_access_key".into(),
                    label: "S3 Access Key (blank = auto)".into(),
                    value: c.s3_access_key.clone(),
                    secret: true,
                },
                ConfigField {
                    key: "s3_secret_key".into(),
                    label: "S3 Secret Key (blank = auto)".into(),
                    value: c.s3_secret_key.clone(),
                    secret: true,
                },
                ConfigField {
                    key: "s3_bucket".into(),
                    label: "S3 Bucket".into(),
                    value: c.s3_bucket.clone(),
                    secret: false,
                },
            ]);
        }

        if profile_app {
            fields.extend([
                ConfigField {
                    key: "nextauth_secret".into(),
                    label: "NextAuth Secret (blank = auto)".into(),
                    value: c.nextauth_secret.clone(),
                    secret: true,
                },
                ConfigField {
                    key: "nextauth_url".into(),
                    label: "NextAuth URL".into(),
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
                    label: "Admin Password (blank = auto)".into(),
                    value: c.admin_password.clone(),
                    secret: true,
                },
                // Sidecar URLs — where the app will reach them.
                ConfigField {
                    key: "mineru_base_url".into(),
                    label: "MinerU Base URL".into(),
                    value: c.sidecar.mineru_base_url.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "rerank_base_url".into(),
                    label: "Rerank Base URL".into(),
                    value: c.sidecar.rerank_base_url.clone(),
                    secret: false,
                },
            ]);
        }

        if profile_sidecars {
            fields.extend([
                ConfigField {
                    key: "gpu_device_id".into(),
                    label: "GPU Device ID (0 = first card)".into(),
                    value: c.sidecar.gpu_device_id.to_string(),
                    secret: false,
                },
                ConfigField {
                    key: "python_venv_dir".into(),
                    label: "Python venv directory".into(),
                    value: c.sidecar.python_venv_dir.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "hf_cache_dir".into(),
                    label: "HuggingFace cache directory".into(),
                    value: c.sidecar.hf_cache_dir.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "rerank_model".into(),
                    label: "Rerank model ID".into(),
                    value: c.sidecar.rerank_model.clone(),
                    secret: false,
                },
                ConfigField {
                    key: "mineru_port".into(),
                    label: "MinerU sidecar port".into(),
                    value: c.sidecar.mineru_port.to_string(),
                    secret: false,
                },
                ConfigField {
                    key: "rerank_port".into(),
                    label: "Rerank sidecar port".into(),
                    value: c.sidecar.rerank_port.to_string(),
                    secret: false,
                },
            ]);
        }

        self.config_items = fields;
    }

    pub fn apply_config_fields(&mut self) {
        for field in &self.config_items {
            let value = &field.value;
            match field.key.as_str() {
                "install_dir" => self.config.install_dir = value.clone(),
                "data_dir" => self.config.data_dir = value.clone(),
                "db_host" => self.config.db_host = value.clone(),
                "db_port" => self.config.db_port = value.clone(),
                "db_name" => self.config.db_name = value.clone(),
                "db_user" => self.config.db_user = value.clone(),
                "db_password" => self.config.db_password = value.clone(),
                "surrealdb_url" => self.config.surrealdb_url = value.clone(),
                "surrealdb_user" => self.config.surrealdb_user = value.clone(),
                "surrealdb_pass" => self.config.surrealdb_pass = value.clone(),
                "s3_endpoint" => self.config.s3_endpoint = value.clone(),
                "s3_access_key" => self.config.s3_access_key = value.clone(),
                "s3_secret_key" => self.config.s3_secret_key = value.clone(),
                "s3_bucket" => self.config.s3_bucket = value.clone(),
                "nextauth_secret" => self.config.nextauth_secret = value.clone(),
                "nextauth_url" => self.config.nextauth_url = value.clone(),
                "openrouter_api_key" => self.config.openrouter_api_key = value.clone(),
                "admin_email" => self.config.admin_email = value.clone(),
                "admin_password" => self.config.admin_password = value.clone(),
                "mineru_base_url" => self.config.sidecar.mineru_base_url = value.clone(),
                "rerank_base_url" => self.config.sidecar.rerank_base_url = value.clone(),
                "gpu_device_id" => {
                    if let Ok(n) = value.parse::<u32>() {
                        self.config.sidecar.gpu_device_id = n;
                    }
                }
                "python_venv_dir" => self.config.sidecar.python_venv_dir = value.clone(),
                "hf_cache_dir" => self.config.sidecar.hf_cache_dir = value.clone(),
                "rerank_model" => self.config.sidecar.rerank_model = value.clone(),
                "mineru_port" => {
                    if let Ok(n) = value.parse::<u16>() {
                        self.config.sidecar.mineru_port = n;
                    }
                }
                "rerank_port" => {
                    if let Ok(n) = value.parse::<u16>() {
                        self.config.sidecar.rerank_port = n;
                    }
                }
                _ => {}
            }
        }
    }

    pub fn screen_step(&self) -> usize {
        match self.screen {
            Screen::Welcome => 1,
            Screen::ProfileSelect => 2,
            Screen::ModeSelect => 3,
            Screen::OptionalServices => 4,
            Screen::Config => 5,
            Screen::Preflight => 6,
            Screen::Progress => 7,
            Screen::Verify => 8,
            Screen::Complete => 9,
            Screen::Error => 0,
        }
    }
}
