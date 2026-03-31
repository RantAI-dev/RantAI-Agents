use ratatui::layout::{Constraint, Direction, Layout, Rect};
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
            format!(" {} Installer ", theme::PRODUCT_NAME),
            theme::primary_bold(),
        ));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    // Center the content vertically
    let logo_lines: Vec<&str> = theme::ASCII_LOGO.lines().collect();
    let logo_height = logo_lines.len() as u16;
    // logo + blank + product name + description + blank + version + blank + key hints = logo_height + 7
    let content_height = logo_height + 7;
    let v_padding = inner.height.saturating_sub(content_height) / 2;

    let content_area = Rect {
        x: inner.x,
        y: inner.y + v_padding,
        width: inner.width,
        height: inner.height.saturating_sub(v_padding),
    };

    let mut lines: Vec<Line> = Vec::new();

    // ASCII logo
    for logo_line in &logo_lines {
        lines.push(Line::from(Span::styled(*logo_line, theme::primary_bold())));
    }

    lines.push(Line::from(""));

    // Product name
    lines.push(Line::from(Span::styled(
        theme::PRODUCT_NAME,
        theme::primary_bold(),
    )));

    // Description
    lines.push(Line::from(Span::styled(
        "Enterprise-grade AI agent platform",
        theme::text(),
    )));

    lines.push(Line::from(""));

    // Version
    lines.push(Line::from(Span::styled(
        format!("v{}", theme::VERSION),
        theme::muted(),
    )));

    lines.push(Line::from(""));

    // Key hints
    lines.push(Line::from(vec![
        Span::styled("Enter", theme::key_hint()),
        Span::styled(" Continue  ", theme::muted()),
        Span::styled("q", theme::key_hint()),
        Span::styled(" Quit", theme::muted()),
    ]));

    let paragraph = Paragraph::new(lines).alignment(ratatui::layout::Alignment::Center);

    f.render_widget(paragraph, content_area);
}
