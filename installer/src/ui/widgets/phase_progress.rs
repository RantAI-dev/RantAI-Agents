use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Gauge, Paragraph};
use ratatui::Frame;

use crate::app::{App, Phase, Status};
use crate::theme;

/// Render the phase progress: overall progress bar + phase list.
pub fn draw(f: &mut Frame, app: &App, area: Rect) {
    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(2), Constraint::Min(0)])
        .split(area);

    // Overall progress bar
    let completed = app
        .phase_statuses
        .iter()
        .filter(|s| matches!(s, Status::Success | Status::Skipped))
        .count();
    let total = Phase::COUNT;
    let ratio = if total > 0 {
        completed as f64 / total as f64
    } else {
        0.0
    };

    let gauge = Gauge::default()
        .gauge_style(theme::primary())
        .ratio(ratio)
        .label(format!("{}/{} phases", completed, total));

    f.render_widget(gauge, sections[0]);

    // Phase list
    let mut lines: Vec<Line> = Vec::new();
    for phase in Phase::ALL {
        let idx = phase.index();
        let status = app
            .phase_statuses
            .get(idx)
            .copied()
            .unwrap_or(Status::Pending);

        let (symbol, style) = match status {
            Status::Success => (theme::SYM_CHECK, theme::success()),
            Status::Error => (theme::SYM_CROSS, theme::error()),
            Status::Warning => (theme::SYM_WARN, theme::warning()),
            Status::Running => (theme::SYM_RUNNING, theme::primary()),
            Status::Skipped => (theme::SYM_SKIP, theme::muted()),
            Status::Pending => (theme::SYM_PENDING, theme::muted()),
        };

        let is_current = app.current_phase.map(|p| p.index()) == Some(idx);
        let name_style = if is_current {
            theme::primary_bold()
        } else if status == Status::Success {
            theme::text()
        } else {
            theme::muted()
        };

        lines.push(Line::from(vec![
            Span::styled(format!("  {} ", symbol), style),
            Span::styled(phase.label(), name_style),
        ]));
    }

    let phase_list = Paragraph::new(lines);
    f.render_widget(phase_list, sections[1]);
}
