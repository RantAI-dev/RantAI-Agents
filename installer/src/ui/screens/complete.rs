use ratatui::layout::{Alignment, Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::app::App;
use crate::installer::run_command;
use crate::theme;
use crate::ui::widgets::status_bar;

/// Resolve the FQDN of the current machine for the hand-off URL block.
/// Tries `hostname -f` first, then `hostname -I` (first token), then falls back.
fn resolve_hostname() -> String {
    if let Ok(out) = run_command("hostname", &["-f"]) {
        let s = out.trim().to_string();
        if !s.is_empty() && !s.contains(' ') {
            return s;
        }
    }
    if let Ok(out) = run_command("hostname", &["-I"]) {
        let s = out.split_whitespace().next().unwrap_or("").to_string();
        if !s.is_empty() {
            return s;
        }
    }
    "<THIS-MACHINE>".to_string()
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
        .title(Span::styled(
            " Installation Complete ",
            theme::primary_bold(),
        ));

    let inner = block.inner(outer[0]);
    f.render_widget(block, outer[0]);

    let mut lines: Vec<Line> = Vec::new();

    // Success header
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        format!("{} Installation Successful!", theme::SYM_CHECK),
        theme::success(),
    )));
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        format!("{} has been installed and configured.", theme::PRODUCT_NAME),
        theme::text(),
    )));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Access info
    lines.push(Line::from(Span::styled(
        "Access Information",
        theme::primary_bold(),
    )));
    lines.push(Line::from(vec![
        Span::styled("  Web UI:      ", theme::muted()),
        Span::styled(&app.config.nextauth_url, theme::info()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  Admin Email: ", theme::muted()),
        Span::styled(&app.config.admin_email, theme::text()),
    ]));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Next steps
    lines.push(Line::from(Span::styled(
        "Next Steps",
        theme::primary_bold(),
    )));
    lines.push(Line::from(vec![
        Span::styled("  1. ", theme::primary()),
        Span::styled("Open the web UI in your browser", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  2. ", theme::primary()),
        Span::styled("Login with the admin credentials above", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  3. ", theme::primary()),
        Span::styled("Create your first AI agent", theme::text()),
    ]));
    lines.push(Line::from(vec![
        Span::styled("  4. ", theme::primary()),
        Span::styled("Check service status: ", theme::text()),
        Span::styled("systemctl status rantai-agents", theme::muted()),
    ]));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Sidecar URL panel — only shown when sidecars were installed
    if app.config.profile.includes_sidecars() {
        let hostname = resolve_hostname();
        let mineru_url = format!("http://{}:{}", hostname, app.config.sidecar.mineru_port);
        let rerank_url = format!("http://{}:{}", hostname, app.config.sidecar.rerank_port);
        let rerank_model = &app.config.sidecar.rerank_model;

        let box_width = 70usize;
        let divider = "─".repeat(box_width - 2);

        lines.push(Line::from(Span::styled(
            format!("┌{}┐", divider),
            theme::primary(),
        )));
        lines.push(Line::from(vec![
            Span::styled("│ ", theme::primary()),
            Span::styled(
                "SIDECAR URLs — paste these into your app server's .env",
                theme::primary_bold(),
            ),
            Span::styled(" │", theme::primary()),
        ]));
        lines.push(Line::from(Span::styled(
            format!("│{}│", " ".repeat(box_width - 2)),
            theme::primary(),
        )));
        lines.push(Line::from(vec![
            Span::styled("│  ", theme::primary()),
            Span::styled("KB_EXTRACT_PRIMARY=\"smart\"", theme::info()),
            Span::styled(
                format!("{} │", " ".repeat(box_width.saturating_sub(27 + 4))),
                theme::primary(),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::styled("│  ", theme::primary()),
            Span::styled(
                format!("KB_EXTRACT_MINERU_BASE_URL=\"{mineru_url}\""),
                theme::info(),
            ),
            Span::styled(
                format!(
                    "{} │",
                    " ".repeat(box_width.saturating_sub(
                        "KB_EXTRACT_MINERU_BASE_URL=\"\"".len() + mineru_url.len() + 4
                    ))
                ),
                theme::primary(),
            ),
        ]));
        lines.push(Line::from(Span::styled(
            format!("│{}│", " ".repeat(box_width - 2)),
            theme::primary(),
        )));
        lines.push(Line::from(vec![
            Span::styled("│  ", theme::primary()),
            Span::styled("KB_RERANK_ENABLED=\"true\"", theme::info()),
            Span::styled(
                format!("{} │", " ".repeat(box_width.saturating_sub(24 + 4))),
                theme::primary(),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::styled("│  ", theme::primary()),
            Span::styled("KB_RERANK_PROVIDER=\"vllm\"", theme::info()),
            Span::styled(
                format!("{} │", " ".repeat(box_width.saturating_sub(25 + 4))),
                theme::primary(),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::styled("│  ", theme::primary()),
            Span::styled(
                format!("KB_RERANK_BASE_URL=\"{rerank_url}\""),
                theme::info(),
            ),
            Span::styled(
                format!(
                    "{} │",
                    " ".repeat(
                        box_width
                            .saturating_sub("KB_RERANK_BASE_URL=\"\"".len() + rerank_url.len() + 4)
                    )
                ),
                theme::primary(),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::styled("│  ", theme::primary()),
            Span::styled(format!("KB_RERANK_MODEL=\"{rerank_model}\""), theme::info()),
            Span::styled(
                format!(
                    "{} │",
                    " ".repeat(
                        box_width
                            .saturating_sub("KB_RERANK_MODEL=\"\"".len() + rerank_model.len() + 4)
                    )
                ),
                theme::primary(),
            ),
        ]));
        lines.push(Line::from(Span::styled(
            format!("│{}│", " ".repeat(box_width - 2)),
            theme::primary(),
        )));
        lines.push(Line::from(Span::styled(
            format!("└{}┘", divider),
            theme::primary(),
        )));
        lines.push(Line::from(""));
    }

    // Key hints
    lines.push(Line::from(vec![
        Span::styled("Enter", theme::key_hint()),
        Span::styled(" Exit  ", theme::muted()),
        Span::styled("q", theme::key_hint()),
        Span::styled(" Exit", theme::muted()),
    ]));

    let paragraph = Paragraph::new(lines).alignment(Alignment::Left);
    f.render_widget(paragraph, inner);
}
