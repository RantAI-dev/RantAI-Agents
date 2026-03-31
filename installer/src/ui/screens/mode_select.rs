use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph};
use ratatui::Frame;

use crate::app::{App, InstallMode};
use crate::theme;
use crate::ui::widgets::status_bar;

const MODES: [InstallMode; 4] = [
    InstallMode::Full,
    InstallMode::Minimal,
    InstallMode::Docker,
    InstallMode::Development,
];

pub fn draw(f: &mut Frame, app: &App) {
    let size = f.area();

    let outer = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(1)])
        .split(size);

    status_bar::draw(f, app, outer[1]);

    let main_block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border_active())
        .title(Span::styled(" Installation Mode ", theme::primary_bold()));

    let main_inner = main_block.inner(outer[0]);
    f.render_widget(main_block, outer[0]);

    // Split into left (list) and right (details) panels
    let panels = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
        .split(main_inner);

    // Left panel: mode list
    let items: Vec<ListItem> = MODES
        .iter()
        .enumerate()
        .map(|(i, mode)| {
            let indicator = if i == app.mode_index {
                theme::SYM_ARROW
            } else {
                " "
            };
            let style = if i == app.mode_index {
                theme::primary_bold()
            } else {
                theme::text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!(" {} ", indicator), theme::primary()),
                Span::styled(mode.label(), style),
            ]))
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::RIGHT)
            .border_style(theme::border_inactive()),
    );

    f.render_widget(list, panels[0]);

    // Right panel: selected mode details
    let selected = MODES[app.mode_index];
    let mut details: Vec<Line> = Vec::new();

    details.push(Line::from(Span::styled(
        selected.label(),
        theme::primary_bold(),
    )));
    details.push(Line::from(""));
    details.push(Line::from(Span::styled(
        selected.description(),
        theme::text(),
    )));
    details.push(Line::from(""));

    // What's included
    details.push(Line::from(Span::styled("Includes:", theme::muted())));

    if selected.includes_docker_services() {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CHECK), theme::success()),
            Span::styled("Docker services (PostgreSQL, SurrealDB, RustFS)", theme::text()),
        ]));
    } else {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CROSS), theme::muted()),
            Span::styled("Docker services (bring your own)", theme::muted()),
        ]));
    }

    if selected.includes_systemd() {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CHECK), theme::success()),
            Span::styled("Systemd service management", theme::text()),
        ]));
    } else {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CROSS), theme::muted()),
            Span::styled("Systemd service management", theme::muted()),
        ]));
    }

    if selected.includes_native_app() {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CHECK), theme::success()),
            Span::styled("Native app (Bun runtime)", theme::text()),
        ]));
    } else {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CROSS), theme::muted()),
            Span::styled("Native app", theme::muted()),
        ]));
    }

    if matches!(selected, InstallMode::Docker) {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CHECK), theme::success()),
            Span::styled("Docker Compose orchestration", theme::text()),
        ]));
    }

    if matches!(selected, InstallMode::Development) {
        details.push(Line::from(vec![
            Span::styled(format!("  {} ", theme::SYM_CHECK), theme::success()),
            Span::styled("Development mode (bun dev)", theme::text()),
        ]));
    }

    details.push(Line::from(""));

    // Key hints
    details.push(Line::from(vec![
        Span::styled("Up/Down", theme::key_hint()),
        Span::styled(" Select  ", theme::muted()),
        Span::styled("Enter", theme::key_hint()),
        Span::styled(" Confirm  ", theme::muted()),
        Span::styled("Esc", theme::key_hint()),
        Span::styled(" Back  ", theme::muted()),
        Span::styled("q", theme::key_hint()),
        Span::styled(" Quit", theme::muted()),
    ]));

    let detail_block = Block::default().borders(Borders::NONE);
    let detail_para = Paragraph::new(details).block(detail_block);
    f.render_widget(detail_para, panels[1]);
}
