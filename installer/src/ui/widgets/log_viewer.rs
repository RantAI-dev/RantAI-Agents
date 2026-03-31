use ratatui::layout::Rect;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{LogEntry, LogLevel};
use crate::theme;

/// Render log entries with timestamp, level badge, and message.
/// Supports scrolling via `scroll_offset`.
pub fn draw(f: &mut Frame, entries: &[&LogEntry], scroll_offset: usize, area: Rect) {
    let visible_height = area.height as usize;
    let total = entries.len();

    // Clamp scroll offset so we don't scroll past the end
    let max_scroll = total.saturating_sub(visible_height);
    let offset = scroll_offset.min(max_scroll);

    let visible = entries
        .iter()
        .skip(offset)
        .take(visible_height);

    let lines: Vec<Line> = visible
        .map(|entry| {
            let (badge, badge_style) = level_display(entry.level);

            Line::from(vec![
                Span::styled(format!("{} ", entry.timestamp), theme::muted()),
                Span::styled(format!("{:<7} ", badge), badge_style),
                Span::styled(&entry.message, level_message_style(entry.level)),
            ])
        })
        .collect();

    let paragraph = Paragraph::new(lines);
    f.render_widget(paragraph, area);
}

fn level_display(level: LogLevel) -> (&'static str, ratatui::style::Style) {
    match level {
        LogLevel::Debug => ("DEBUG", theme::muted()),
        LogLevel::Info => ("INFO", theme::info()),
        LogLevel::Success => ("OK", theme::success()),
        LogLevel::Warning => ("WARN", theme::warning()),
        LogLevel::Error => ("ERROR", theme::error()),
    }
}

fn level_message_style(level: LogLevel) -> ratatui::style::Style {
    match level {
        LogLevel::Debug => theme::muted(),
        LogLevel::Info => theme::text(),
        LogLevel::Success => theme::success(),
        LogLevel::Warning => theme::warning(),
        LogLevel::Error => theme::error(),
    }
}
