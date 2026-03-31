use ratatui::layout::Rect;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, Screen};
use crate::theme;

/// Render the bottom status bar.
pub fn draw(f: &mut Frame, app: &App, area: Rect) {
    let screen_label = screen_name(app.screen);
    let step = app.screen_step();

    let line = Line::from(vec![
        Span::styled(format!(" {} ", theme::PRODUCT_NAME), theme::primary_bold()),
        Span::styled("\u{2502}", theme::muted()),
        Span::styled(format!(" {} ", screen_label), theme::muted()),
        Span::styled("\u{2502}", theme::muted()),
        Span::styled(format!(" Step {}/8 ", step), theme::muted()),
        Span::styled("\u{2502}", theme::muted()),
        Span::styled(format!(" v{} ", theme::VERSION), theme::muted()),
    ]);

    let bar = Paragraph::new(line);
    f.render_widget(bar, area);
}

fn screen_name(screen: Screen) -> &'static str {
    match screen {
        Screen::Welcome => "Welcome",
        Screen::ModeSelect => "Mode Selection",
        Screen::OptionalServices => "Optional Services",
        Screen::Config => "Configuration",
        Screen::Preflight => "Preflight Checks",
        Screen::Progress => "Installation",
        Screen::Verify => "Verification",
        Screen::Complete => "Complete",
        Screen::Error => "Error",
    }
}
