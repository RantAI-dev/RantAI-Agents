use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Wrap};
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

    // Center the error dialog
    let dialog = centered_rect(70, 60, outer[0]);

    // Clear the background behind the dialog
    f.render_widget(Clear, dialog);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::error())
        .title(Span::styled(" Error ", theme::error()));

    let inner = block.inner(dialog);
    f.render_widget(block, dialog);

    let error_msg = app
        .error_message
        .as_deref()
        .unwrap_or("An unknown error occurred.");

    let mut lines: Vec<Line> = Vec::new();

    // Error title
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        format!("{} Installation Failed", theme::SYM_CROSS),
        theme::error(),
    )));
    lines.push(Line::from(""));

    // Error message
    lines.push(Line::from(Span::styled(error_msg, theme::text())));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Troubleshooting
    lines.push(Line::from(Span::styled(
        "Troubleshooting",
        theme::primary_bold(),
    )));
    lines.push(Line::from(vec![
        Span::styled("  1. ", theme::muted()),
        Span::styled("Check the installation logs above", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  2. ", theme::muted()),
        Span::styled("Run: ", theme::text()),
        Span::styled("journalctl -u rantai-agents", theme::muted()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  3. ", theme::muted()),
        Span::styled("Report issues: ", theme::text()),
        Span::styled(
            "https://github.com/RantAI/RantAI-Agents/issues",
            theme::info(),
        ),
    ]));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Key hints
    lines.push(Line::from(vec![
        Span::styled("Esc", theme::key_hint()),
        Span::styled(" Exit  ", theme::muted()),
        Span::styled("q", theme::key_hint()),
        Span::styled(" Exit", theme::muted()),
    ]));

    let paragraph = Paragraph::new(lines)
        .alignment(Alignment::Left)
        .wrap(Wrap { trim: true });
    f.render_widget(paragraph, inner);
}

/// Create a centered rectangle within the given area.
fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}
