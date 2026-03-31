use ratatui::layout::{Alignment, Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::App;
use crate::theme;
use crate::ui::widgets::status_bar;

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();

    let outer = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(1)])
        .split(size);

    status_bar::draw(f, app, outer[1]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border_active())
        .title(Span::styled(
            " Installation Complete ",
            theme::primary_bold(),
        ));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let mut lines: Vec<Line> = Vec::new();

    // Success header
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        format!("{} Installation Successful!", theme::SYM_CHECK),
        theme::success(),
    )));
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        format!("{} has been installed and configured.", theme::PRODUCT_NAME),
        theme::text(),
    )));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Access info
    lines.push(Line::from(Span::styled(
        "Access Information",
        theme::primary_bold(),
    )));
    lines.push(Line::from(vec![
        Span::styled("  Web UI:      ", theme::muted()),
        Span::styled(&app.config.nextauth_url, theme::info()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  Admin Email: ", theme::muted()),
        Span::styled(&app.config.admin_email, theme::text()),
    ]));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Next steps
    lines.push(Line::from(Span::styled(
        "Next Steps",
        theme::primary_bold(),
    )));
    lines.push(Line::from(vec![
        Span::styled("  1. ", theme::primary()),
        Span::styled("Open the web UI in your browser", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  2. ", theme::primary()),
        Span::styled("Login with the admin credentials above", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  3. ", theme::primary()),
        Span::styled("Create your first AI agent", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  4. ", theme::primary()),
        Span::styled("Check service status: ", theme::text()),
        Span::styled("systemctl status rantai-agents", theme::muted()),
    ]));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Key hints
    lines.push(Line::from(vec![
        Span::styled("Enter", theme::key_hint()),
        Span::styled(" Exit  ", theme::muted()),
        Span::styled("q", theme::key_hint()),
        Span::styled(" Exit", theme::muted()),
    ]));

    let paragraph = Paragraph::new(lines).alignment(Alignment::Left);
    f.render_widget(paragraph, inner);
}
