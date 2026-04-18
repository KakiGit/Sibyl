use crate::theme::colors::*;
use ratatui::style::{Modifier, Style};

pub fn default() -> Style {
    Style::default().fg(FOREGROUND).bg(BACKGROUND)
}

pub fn user_message() -> Style {
    Style::default().fg(USER_MESSAGE).bg(BACKGROUND)
}

pub fn assistant_message() -> Style {
    Style::default().fg(ASSISTANT).bg(BACKGROUND)
}

pub fn system_message() -> Style {
    Style::default().fg(SYSTEM).bg(BACKGROUND)
}

pub fn memory_highlight() -> Style {
    Style::default().fg(MEMORY).bg(BACKGROUND)
}

pub fn error() -> Style {
    Style::default().fg(ERROR).bg(BACKGROUND)
}

pub fn success() -> Style {
    Style::default().fg(SUCCESS).bg(BACKGROUND)
}

pub fn warning() -> Style {
    Style::default().fg(WARNING).bg(BACKGROUND)
}

pub fn accent() -> Style {
    Style::default().fg(ACCENT).bg(BACKGROUND)
}

pub fn muted() -> Style {
    Style::default().fg(MUTED).bg(BACKGROUND)
}

pub fn border() -> Style {
    Style::default().fg(BORDER).bg(BACKGROUND)
}

pub fn border_focused() -> Style {
    Style::default()
        .fg(ACCENT)
        .bg(BACKGROUND)
        .add_modifier(Modifier::BOLD)
}

pub fn code_block() -> Style {
    Style::default().fg(FOREGROUND).bg(CODE_BLOCK)
}

pub fn header() -> Style {
    Style::default()
        .fg(ACCENT)
        .bg(BACKGROUND)
        .add_modifier(Modifier::BOLD)
}
