use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::{App, InstallProfile};
use crate::theme;
use crate::ui::widgets::status_bar;

const PROFILES: [InstallProfile; 3] = [
    InstallProfile::AllInOne,
    InstallProfile::AppOnly,
    InstallProfile::SidecarOnly,
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
            " Installation Profile ",
            theme::primary_bold(),
        ));

    let main_inner = main_block.inner(outer[0]);
    f.render_widget(main_block, outer[0]);

    let panels = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(35), Constraint::Percentage(65)])
        .split(main_inner);

    let items: Vec<ListItem> = PROFILES
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let indicator = if i == app.profile_index {
                theme::SYM_ARROW
            } else {
                " "
            };
            let style = if i == app.profile_index {
                theme::primary_bold()
            } else {
                theme::text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!(" {} ", indicator), theme::primary()),
                Span::styled(p.label(), style),
            ]))
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::RIGHT)
            .border_style(theme::border_inactive()),
    );
    f.render_widget(list, panels[0]);

    let selected = PROFILES[app.profile_index];
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
    let hint = match selected {
        InstallProfile::AppOnly => {
            "You'll be prompted for sidecar URLs (MinerU, rerank) pointing at your GPU box."
        }
        InstallProfile::SidecarOnly => {
            "Requires NVIDIA GPU. The installer will create a Python venv, install deps, \
             pre-download the Nemotron rerank model, and install systemd units."
        }
        InstallProfile::AllInOne => {
            "Everything on this machine. GPU recommended for the on-prem OCR / rerank path, \
             but you can also use cloud providers."
        }
    };
    details.push(Line::from(Span::styled(hint, theme::primary())));

    let para = Paragraph::new(details).wrap(Wrap { trim: true });
    f.render_widget(para, panels[1]);
}

/// Translates `profile_index` to `InstallProfile`. Keep this in sync with `PROFILES`.
pub fn selected_profile(app: &App) -> InstallProfile {
    PROFILES[app.profile_index]
}
