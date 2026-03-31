pub mod screens;
pub mod widgets;

use crate::app::{App, Screen};
use ratatui::Frame;

pub fn draw(f: &mut Frame, app: &App) {
    // Check minimum terminal size
    let size = f.area();
    if size.width < 60 || size.height < 20 {
        // Render size warning
        let warning =
            ratatui::widgets::Paragraph::new("Terminal too small. Minimum 60x20 required.")
                .style(crate::theme::warning());
        f.render_widget(warning, size);
        return;
    }

    match app.screen {
        Screen::Welcome => screens::welcome::draw(f, app),
        Screen::ModeSelect => screens::mode_select::draw(f, app),
        Screen::OptionalServices => screens::optional_services::draw(f, app),
        Screen::Config => screens::config::draw(f, app),
        Screen::Preflight => screens::preflight::draw(f, app),
        Screen::Progress => screens::progress::draw(f, app),
        Screen::Verify => screens::verify::draw(f, app),
        Screen::Complete => screens::complete::draw(f, app),
        Screen::Error => screens::error::draw(f, app),
    }
}
