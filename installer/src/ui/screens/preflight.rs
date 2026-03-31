use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::{App, Status};
use crate::theme;
use crate::ui::widgets::{checklist, status_bar};

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
        .title(Span::styled(" Preflight Checks ", theme::primary_bold()));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let content_area = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // header / spinner
            Constraint::Min(0),    // checklist
            Constraint::Length(3), // summary + hints
        ])
        .split(inner);

    // Header with status
    let header_text = if app.preflight_running {
        Line::from(vec![
            Span::styled(
                format!("{} ", theme::spinner_frame(app.spinner_tick)),
                theme::primary(),
            ),
            Span::styled("Running preflight checks...", theme::text()),
        ])
    } else if app.preflight_done {
        let has_errors = app
            .preflight_checks
            .iter()
            .any(|c| c.status == Status::Error);
        if has_errors {
            Line::from(vec![
                Span::styled(format!("{} ", theme::SYM_CROSS), theme::error()),
                Span::styled("Preflight checks failed", theme::error()),
            ])
        } else {
            Line::from(vec![
                Span::styled(format!("{} ", theme::SYM_CHECK), theme::success()),
                Span::styled("Preflight checks passed", theme::success()),
            ])
        }
    } else {
        Line::from(Span::styled(
            "Preparing preflight checks...",
            theme::muted(),
        ))
    };

    let header = Paragraph::new(header_text);
    f.render_widget(header, content_area[0]);

    // Checklist
    checklist::draw(f, "Checks", &app.preflight_checks, content_area[1]);

    // Summary + hints
    let passed = app
        .preflight_checks
        .iter()
        .filter(|c| c.status == Status::Success)
        .count();
    let warnings = app
        .preflight_checks
        .iter()
        .filter(|c| c.status == Status::Warning)
        .count();
    let errors = app
        .preflight_checks
        .iter()
        .filter(|c| c.status == Status::Error)
        .count();

    let mut summary_lines: Vec<Line> = Vec::new();

    if app.preflight_done {
        summary_lines.push(Line::from(vec![
            Span::styled(format!("{} passed", passed), theme::success()),
            Span::styled("  ", theme::muted()),
            Span::styled(format!("{} warnings", warnings), theme::warning()),
            Span::styled("  ", theme::muted()),
            Span::styled(format!("{} errors", errors), theme::error()),
        ]));
    }

    // Key hints based on state
    if app.preflight_running {
        summary_lines.push(Line::from(Span::styled("Please wait...", theme::muted())));
    } else if app.preflight_done && errors == 0 {
        summary_lines.push(Line::from(vec![
            Span::styled("Enter", theme::key_hint()),
            Span::styled(" Continue  ", theme::muted()),
            Span::styled("r", theme::key_hint()),
            Span::styled(" Re-run  ", theme::muted()),
            Span::styled("Esc", theme::key_hint()),
            Span::styled(" Back  ", theme::muted()),
            Span::styled("q", theme::key_hint()),
            Span::styled(" Quit", theme::muted()),
        ]));
    } else if app.preflight_done {
        summary_lines.push(Line::from(vec![
            Span::styled("r", theme::key_hint()),
            Span::styled(" Re-run  ", theme::muted()),
            Span::styled("Esc", theme::key_hint()),
            Span::styled(" Back  ", theme::muted()),
            Span::styled("q", theme::key_hint()),
            Span::styled(" Quit", theme::muted()),
        ]));
    }

    let summary = Paragraph::new(summary_lines);
    f.render_widget(summary, content_area[2]);
}
