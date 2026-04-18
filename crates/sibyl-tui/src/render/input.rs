use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
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
    let (style, border_style) = if focused {
        (default(), border_focused())
    } else {
        (muted(), border())
    };

    let (display_text, text_style): (&str, Style) = if state.buffer.is_empty() {
        if focused {
            ("Type your message → Enter to send", muted())
        } else {
            ("Press any key to start typing", muted())
        }
    } else {
        (state.buffer.as_str(), style)
    };

    let prefix = if processing {
        vec![Span::styled("◐ ", warning())]
    } else if focused {
        vec![Span::styled("▶ ", accent().add_modifier(Modifier::BOLD))]
    } else {
        vec![Span::styled("○ ", muted())]
    };

    let text_spans: Vec<Span<'_>> = vec![Span::styled(display_text, text_style)];

    let input = Paragraph::new(Line::from(
        prefix.into_iter().chain(text_spans).collect::<Vec<_>>(),
    ))
    .block(
        Block::default()
            .borders(Borders::ALL)
            .title(if focused { " Input " } else { " " })
            .title_style(if focused { header() } else { muted() })
            .style(border_style),
    );

    f.render_widget(input, area);

    if focused && !state.buffer.is_empty() {
        let cursor_x = area.x + 3 + state.cursor_position as u16;
        let cursor_y = area.y + 1;
        f.set_cursor_position((cursor_x, cursor_y));
    }
}

pub fn render_command_input(f: &mut Frame, state: &InputState, area: Rect) {
    let prefix = vec![Span::styled("▶ ", accent().add_modifier(Modifier::BOLD))];

    let content_spans: Vec<Span<'_>> = if state.buffer.starts_with('/') {
        vec![
            Span::styled("/", accent().add_modifier(Modifier::BOLD)),
            Span::styled(&state.buffer[1..], accent()),
        ]
    } else {
        vec![Span::styled(&state.buffer, default())]
    };

    let input = Paragraph::new(Line::from(
        prefix.into_iter().chain(content_spans).collect::<Vec<_>>(),
    ))
    .block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Command ")
            .title_style(header())
            .style(border_focused()),
    );

    f.render_widget(input, area);

    let cursor_x = area.x + 3 + state.cursor_position as u16;
    let cursor_y = area.y + 1;
    f.set_cursor_position((cursor_x, cursor_y));
}
