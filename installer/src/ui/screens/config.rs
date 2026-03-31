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
        .title(Span::styled(" Configuration ", theme::primary_bold()));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let content_area = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // header
            Constraint::Min(0),    // fields
            Constraint::Length(2), // key hints / edit box
        ])
        .split(inner);

    // Header
    let header = Paragraph::new(Line::from(Span::styled(
        format!("Configure {} ({})", theme::PRODUCT_NAME, app.mode.label()),
        theme::text(),
    )));
    f.render_widget(header, content_area[0]);

    // Config fields
    let mut lines: Vec<Line> = Vec::new();
    for (i, field) in app.config_items.iter().enumerate() {
        let is_selected = i == app.config_index;
        let indicator = if is_selected { theme::SYM_ARROW } else { " " };

        let display_value = if field.secret && !field.value.is_empty() {
            "\u{2022}".repeat(field.value.len().min(20))
        } else if field.value.is_empty() {
            "(empty)".to_string()
        } else {
            field.value.clone()
        };

        let label_style = if is_selected {
            theme::primary_bold()
        } else {
            theme::text()
        };
        let value_style = if is_selected {
            theme::text()
        } else {
            theme::muted()
        };

        lines.push(Line::from(vec![
            Span::styled(format!(" {} ", indicator), theme::primary()),
            Span::styled(format!("{:<22}", field.label), label_style),
            Span::styled(display_value, value_style),
        ]));
    }

    let fields_para = Paragraph::new(lines);
    f.render_widget(fields_para, content_area[1]);

    // Bottom area: edit box or key hints
    if app.config_editing {
        draw_edit_box(f, app, content_area[2]);
    } else {
        let hints = Paragraph::new(Line::from(vec![
            Span::styled("Up/Down", theme::key_hint()),
            Span::styled(" Navigate  ", theme::muted()),
            Span::styled("Enter", theme::key_hint()),
            Span::styled(" Edit  ", theme::muted()),
            Span::styled("Tab", theme::key_hint()),
            Span::styled(" Continue  ", theme::muted()),
            Span::styled("Esc", theme::key_hint()),
            Span::styled(" Back  ", theme::muted()),
            Span::styled("q", theme::key_hint()),
            Span::styled(" Quit", theme::muted()),
        ]));
        f.render_widget(hints, content_area[2]);
    }
}

fn draw_edit_box(f: &mut Frame, app: &App, area: Rect) {
    let label = app
        .config_items
        .get(app.config_index)
        .map(|f| f.label.as_str())
        .unwrap_or("Field");

    let is_secret = app
        .config_items
        .get(app.config_index)
        .map(|f| f.secret)
        .unwrap_or(false);

    let display_buf = if is_secret {
        "\u{2022}".repeat(app.config_buffer.len())
    } else {
        app.config_buffer.clone()
    };

    let edit_line = Line::from(vec![
        Span::styled(format!("{}: ", label), theme::primary()),
        Span::styled(&display_buf, theme::text()),
        Span::styled("\u{2588}", theme::primary()), // cursor block
    ]);

    let edit_block = Block::default()
        .borders(Borders::TOP)
        .border_style(theme::border_active());

    let para = Paragraph::new(edit_line).block(edit_block);
    f.render_widget(para, area);
}
