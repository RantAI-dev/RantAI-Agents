use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::App;
use crate::theme;
use crate::ui::widgets::{log_viewer, phase_progress, status_bar};

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
        .title(Span::styled(" Installation Progress ", theme::primary_bold()));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let content_area = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2),  // header / spinner
            Constraint::Length(12), // phase progress
            Constraint::Min(0),    // log viewer
            Constraint::Length(2),  // key hints
        ])
        .split(inner);

    // Header with current phase
    let header_text = if let Some(phase) = app.current_phase {
        Line::from(vec![
            Span::styled(
                format!("{} ", theme::spinner_frame(app.spinner_tick)),
                theme::primary(),
            ),
            Span::styled(phase.label().to_string(), theme::primary_bold()),
        ])
    } else if app.install_done {
        if app.install_error.is_some() {
            Line::from(vec![
                Span::styled(format!("{} ", theme::SYM_CROSS), theme::error()),
                Span::styled("Installation failed", theme::error()),
            ])
        } else {
            Line::from(vec![
                Span::styled(format!("{} ", theme::SYM_CHECK), theme::success()),
                Span::styled("Installation complete", theme::success()),
            ])
        }
    } else {
        Line::from(Span::styled("Preparing installation...", theme::muted()))
    };

    let header = Paragraph::new(header_text);
    f.render_widget(header, content_area[0]);

    // Phase progress
    phase_progress::draw(f, app, content_area[1]);

    // Log viewer
    let log_block = Block::default()
        .borders(Borders::TOP)
        .border_style(theme::border_inactive())
        .title(Span::styled(" Logs ", theme::muted()));
    let log_inner = log_block.inner(content_area[2]);
    f.render_widget(log_block, content_area[2]);

    let log_entries: Vec<&crate::app::LogEntry> = app.logs.iter().collect();
    log_viewer::draw(f, &log_entries, app.log_scroll, log_inner);

    // Key hints
    let hints = if app.install_done {
        Line::from(vec![
            Span::styled("Enter", theme::key_hint()),
            Span::styled(" Continue", theme::muted()),
        ])
    } else {
        Line::from(vec![
            Span::styled("Up/Down", theme::key_hint()),
            Span::styled(" Scroll logs", theme::muted()),
        ])
    };

    let hints_para = Paragraph::new(hints);
    f.render_widget(hints_para, content_area[3]);
}
