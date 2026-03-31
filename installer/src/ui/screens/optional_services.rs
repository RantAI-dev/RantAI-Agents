use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::App;
use crate::theme;
use crate::ui::widgets::status_bar;

struct ServiceEntry {
    label: &'static str,
    description: &'static str,
    enabled: bool,
}

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
        .title(Span::styled(" Optional Services ", theme::primary_bold()));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let services = [
        ServiceEntry {
            label: "Ollama",
            description: "OCR & Vision models — local AI inference engine",
            enabled: app.config.enable_ollama,
        },
        ServiceEntry {
            label: "Piston",
            description: "Sandboxed code execution — run untrusted code safely",
            enabled: app.config.enable_piston,
        },
        ServiceEntry {
            label: "SearXNG",
            description: "Private web search — privacy-respecting metasearch",
            enabled: app.config.enable_searxng,
        },
    ];

    let content_area = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // header
            Constraint::Min(0),    // services
            Constraint::Length(2), // key hints
        ])
        .split(inner);

    // Header
    let header = Paragraph::new(Line::from(Span::styled(
        "Select optional services to include in your installation:",
        theme::text(),
    )));
    f.render_widget(header, content_area[0]);

    // Services list
    let mut lines: Vec<Line> = Vec::new();
    for (i, svc) in services.iter().enumerate() {
        let is_selected = i == app.optional_index;
        let checkbox = if svc.enabled { "[x]" } else { "[ ]" };
        let indicator = if is_selected { theme::SYM_ARROW } else { " " };

        let label_style = if is_selected {
            theme::primary_bold()
        } else {
            theme::text()
        };

        lines.push(Line::from(vec![
            Span::styled(format!(" {} ", indicator), theme::primary()),
            Span::styled(format!("{} ", checkbox), theme::primary()),
            Span::styled(svc.label, label_style),
        ]));

        lines.push(Line::from(vec![
            Span::raw("       "),
            Span::styled(svc.description, theme::muted()),
        ]));

        lines.push(Line::from(""));
    }

    let list_para = Paragraph::new(lines);
    f.render_widget(list_para, content_area[1]);

    // Key hints
    let hints = Paragraph::new(Line::from(vec![
        Span::styled("Up/Down", theme::key_hint()),
        Span::styled(" Navigate  ", theme::muted()),
        Span::styled("Space", theme::key_hint()),
        Span::styled(" Toggle  ", theme::muted()),
        Span::styled("Enter", theme::key_hint()),
        Span::styled(" Continue  ", theme::muted()),
        Span::styled("Esc", theme::key_hint()),
        Span::styled(" Back  ", theme::muted()),
        Span::styled("q", theme::key_hint()),
        Span::styled(" Quit", theme::muted()),
    ]));
    f.render_widget(hints, content_area[2]);
}
