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
        .title(Span::styled(" Verification ", theme::primary_bold()));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let content_area = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // header
            Constraint::Min(0),    // checklist
            Constraint::Length(2), // key hints
        ])
        .split(inner);

    // Header with status
    let header_text = if app.verify_running {
        Line::from(vec![
            Span::styled(
                format!("{} ", theme::spinner_frame(app.spinner_tick)),
                theme::primary(),
            ),
            Span::styled("Running verification checks...", theme::text()),
        ])
    } else if app.verify_done {
        let has_errors = app.verify_checks.iter().any(|c| c.status == Status::Error);
        if has_errors {
            Line::from(vec![
                Span::styled(format!("{} ", theme::SYM_WARN), theme::warning()),
                Span::styled("Verification completed with issues", theme::warning()),
            ])
        } else {
            Line::from(vec![
                Span::styled(format!("{} ", theme::SYM_CHECK), theme::success()),
                Span::styled("All verifications passed", theme::success()),
            ])
        }
    } else {
        Line::from(Span::styled("Preparing verification...", theme::muted()))
    };

    let header = Paragraph::new(header_text);
    f.render_widget(header, content_area[0]);

    // Checklist
    checklist::draw(f, "Verification", &app.verify_checks, content_area[1]);

    // Key hints
    let hints = if app.verify_running {
        Line::from(Span::styled("Please wait...", theme::muted()))
    } else if app.verify_done {
        Line::from(vec![
            Span::styled("Enter", theme::key_hint()),
            Span::styled(" Continue  ", theme::muted()),
            Span::styled("q", theme::key_hint()),
            Span::styled(" Quit", theme::muted()),
        ])
    } else {
        Line::from(Span::styled("Initializing...", theme::muted()))
    };

    let hints_para = Paragraph::new(hints);
    f.render_widget(hints_para, content_area[2]);
}
