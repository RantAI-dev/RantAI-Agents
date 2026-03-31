use ratatui::style::{Color, Modifier, Style};

// RantAI brand colors
pub const PRIMARY: Color = Color::Rgb(79, 70, 229);     // Indigo #4F46E5
pub const PRIMARY_LIGHT: Color = Color::Rgb(129, 120, 248); // Lighter indigo
pub const SUCCESS: Color = Color::Rgb(16, 185, 129);     // Emerald #10B981
pub const WARNING: Color = Color::Rgb(245, 158, 11);     // Amber #F59E0B
pub const ERROR: Color = Color::Rgb(239, 68, 68);        // Red #EF4444
pub const INFO: Color = Color::Rgb(59, 130, 246);        // Blue #3B82F6
pub const MUTED: Color = Color::Rgb(107, 114, 128);      // Gray-500
pub const TEXT: Color = Color::Rgb(243, 244, 246);        // Gray-100
pub const BG_DARK: Color = Color::Rgb(17, 24, 39);       // Gray-900

// Status symbols
pub const SYM_CHECK: &str = "✓";
pub const SYM_CROSS: &str = "✗";
pub const SYM_WARN: &str = "⚠";
pub const SYM_ARROW: &str = "▶";
pub const SYM_PENDING: &str = "○";
pub const SYM_RUNNING: &str = "◉";
pub const SYM_SKIP: &str = "–";

pub const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

pub fn spinner_frame(tick: usize) -> &'static str {
    SPINNER[tick % SPINNER.len()]
}

// Styles
pub fn primary() -> Style {
    Style::default().fg(PRIMARY)
}

pub fn primary_bold() -> Style {
    Style::default().fg(PRIMARY).add_modifier(Modifier::BOLD)
}

pub fn success() -> Style {
    Style::default().fg(SUCCESS)
}

pub fn warning() -> Style {
    Style::default().fg(WARNING)
}

pub fn error() -> Style {
    Style::default().fg(ERROR)
}

pub fn info() -> Style {
    Style::default().fg(INFO)
}

pub fn muted() -> Style {
    Style::default().fg(MUTED)
}

pub fn text() -> Style {
    Style::default().fg(TEXT)
}

pub fn key_hint() -> Style {
    Style::default().fg(PRIMARY_LIGHT).add_modifier(Modifier::BOLD)
}

pub fn border_active() -> Style {
    Style::default().fg(PRIMARY)
}

pub fn border_inactive() -> Style {
    Style::default().fg(MUTED)
}

pub const PRODUCT_NAME: &str = "RantAI Agents";
pub const COMPANY: &str = "RantAI";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub const ASCII_LOGO: &str = r#"
  ____             _     _    ___
 |  _ \ __ _ _ __ | |_  / \  |_ _|
 | |_) / _` | '_ \| __|/ _ \  | |
 |  _ < (_| | | | | |_/ ___ \ | |
 |_| \_\__,_|_| |_|\__/_/   \_\___|
"#;
