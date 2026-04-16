use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::app::InputState;
use crate::theme::*;

pub fn render_input(
    f: &mut Frame,
    state: &InputState,
    area: Rect,
    focused: bool,
    processing: bool,
) {
    let style = if processing {
        muted()
    } else if focused {
        default()
    } else {
        muted()
    };

    let border_style = if focused { border_focused() } else { border() };

    let display_text = if state.buffer.is_empty() {
        if focused {
            "Send a message (Enter) | /help for commands | Tab for memory"
        } else {
            "Input (press any key to focus)"
        }
    } else {
        &state.buffer
    };

    let text_style = if state.buffer.is_empty() {
        muted()
    } else {
        style
    };

    let input = Paragraph::new(display_text).style(text_style).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Input ")
            .title_style(if focused { header() } else { muted() })
            .style(border_style),
    );

    f.render_widget(input, area);

    if focused && !processing {
        let cursor_x = area.x + 1 + state.cursor_position as u16;
        let cursor_y = area.y + 1;
        f.set_cursor_position((cursor_x, cursor_y));
    }
}

pub fn render_command_input(f: &mut Frame, state: &InputState, area: Rect) {
    let spans: Vec<Span<'_>> = if state.buffer.starts_with('/') {
        vec![
            Span::styled("/", accent().add_modifier(ratatui::style::Modifier::BOLD)),
            Span::styled(&state.buffer[1..], accent()),
        ]
    } else {
        vec![Span::styled(&state.buffer, default())]
    };

    let input = Paragraph::new(Line::from(spans)).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Command ")
            .title_style(header())
            .style(border_focused()),
    );

    f.render_widget(input, area);

    let cursor_x = area.x + 1 + state.cursor_position as u16;
    let cursor_y = area.y + 1;
    f.set_cursor_position((cursor_x, cursor_y));
}
