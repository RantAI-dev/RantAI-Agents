use ratatui::layout::Rect;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{CheckItem, Status};
use crate::theme;

/// Render a checklist of items with status symbols.
pub fn draw(f: &mut Frame, title: &str, items: &[CheckItem], area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    if !title.is_empty() {
        lines.push(Line::from(Span::styled(title, theme::muted())));
    }

    for item in items {
        let (symbol, style) = status_display(item.status);

        let mut spans = vec![
            Span::styled(format!("  {} ", symbol), style),
            Span::styled(&item.name, theme::text()),
        ];

        if let Some(msg) = &item.message {
            spans.push(Span::styled(" \u{2014} ", theme::muted()));
            spans.push(Span::styled(msg, style));
        }

        lines.push(Line::from(spans));
    }

    let paragraph = Paragraph::new(lines);
    f.render_widget(paragraph, area);
}

fn status_display(status: Status) -> (&'static str, ratatui::style::Style) {
    match status {
        Status::Success => (theme::SYM_CHECK, theme::success()),
        Status::Error => (theme::SYM_CROSS, theme::error()),
        Status::Warning => (theme::SYM_WARN, theme::warning()),
        Status::Pending => (theme::SYM_PENDING, theme::muted()),
        Status::Running => (theme::SYM_RUNNING, theme::primary()),
        Status::Skipped => (theme::SYM_SKIP, theme::muted()),
    }
}
