use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::App;
use crate::theme;
use crate::ui::widgets::status_bar;

const OPTIONS: [(&str, &str); 3] = [
    ("Update existing install", "Pull the latest code, re-run dependency install + DB migrations + sidecar refresh, restart services. Your .env is preserved."),
    ("Fresh install (overwrite)", "Wipe the existing install and start over. Your .env will be backed up to install.toml.bak."),
    ("Cancel", "Exit without changing anything."),
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
        .title(Span::styled(
            " Existing Install Detected ",
            theme::primary_bold(),
        ));
    let main_inner = main_block.inner(outer[0]);
    f.render_widget(main_block, outer[0]);

    let panels = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
        .split(main_inner);

    let items: Vec<ListItem> = OPTIONS
        .iter()
        .enumerate()
        .map(|(i, (label, _))| {
            let arrow = if i == app.update_or_fresh_index {
                theme::SYM_ARROW
            } else {
                " "
            };
            let style = if i == app.update_or_fresh_index {
                theme::primary_bold()
            } else {
                theme::text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!(" {arrow} "), theme::primary()),
                Span::styled(*label, style),
            ]))
        })
        .collect();
    let list = List::new(items).block(
        Block::default()
            .borders(Borders::RIGHT)
            .border_style(theme::border_inactive()),
    );
    f.render_widget(list, panels[0]);

    let mut details: Vec<Line> = Vec::new();
    if let Some(s) = &app.install_state {
        details.push(Line::from(Span::styled(
            "Existing install:",
            theme::muted(),
        )));
        details.push(Line::from(format!("  Path:      {}", s.install_dir)));
        details.push(Line::from(format!("  Profile:   {:?}", s.profile)));
        details.push(Line::from(format!("  Mode:      {:?}", s.mode)));
        details.push(Line::from(format!("  Git sha:   {}", s.git_sha)));
        details.push(Line::from(format!("  Installed: {}", s.installed_at)));
        details.push(Line::from(""));
    }
    let (_label, desc) = OPTIONS[app.update_or_fresh_index];
    details.push(Line::from(Span::styled(desc, theme::primary())));

    let para = Paragraph::new(details).wrap(Wrap { trim: true });
    f.render_widget(para, panels[1]);
}

pub fn selected_action(app: &App) -> UpdateAction {
    match app.update_or_fresh_index {
        0 => UpdateAction::Update,
        1 => UpdateAction::Fresh,
        _ => UpdateAction::Cancel,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateAction {
    Update,
    Fresh,
    Cancel,
}
