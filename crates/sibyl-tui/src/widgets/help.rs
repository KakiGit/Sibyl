use ratatui::{
    layout::{Alignment, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

use crate::input::get_command_help;
use crate::theme::{accent, border, default, header, muted};

const KEYBINDINGS: &[(&str, &str)] = &[
    ("j / k", "Scroll chat up/down"),
    ("Ctrl+d / Ctrl+u", "Half-page scroll"),
    ("Enter", "Send message"),
    ("Tab", "Toggle memory panel"),
    ("Ctrl+c", "Quit"),
    ("Esc", "Cancel/Close overlay"),
    ("?", "Show this help"),
    (":", "Open command palette"),
    ("Alt+m", "Toggle memory panel (alternative)"),
    ("Up / Down", "History navigation"),
];

pub fn render_help_overlay(f: &mut Frame, area: Rect) {
    let help_width = 60u16;
    let help_height = (KEYBINDINGS.len() + get_command_help().len() + 6) as u16;

    let help_area = Rect {
        x: (area.width.saturating_sub(help_width)) / 2,
        y: (area.height.saturating_sub(help_height)) / 2,
        width: help_width.min(area.width),
        height: help_height.min(area.height),
    };

    f.render_widget(Clear, help_area);

    let mut lines: Vec<Line<'static>> = Vec::new();

    lines.push(Line::from(""));
    lines.push(Line::from(vec![Span::styled("  Key Bindings", header())]));
    lines.push(Line::from(vec![Span::styled(
        "  ──────────────────────────────────────",
        muted(),
    )]));

    for (key, desc) in KEYBINDINGS {
        lines.push(Line::from(vec![
            Span::styled(format!("  {:20} ", key), accent()),
            Span::styled(desc.to_string(), default()),
        ]));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(vec![Span::styled("  Commands", header())]));
    lines.push(Line::from(vec![Span::styled(
        "  ──────────────────────────────────────",
        muted(),
    )]));

    for (cmd, desc) in get_command_help() {
        lines.push(Line::from(vec![
            Span::styled(format!("  {:25} ", cmd), accent()),
            Span::styled(desc.to_string(), default()),
        ]));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(vec![Span::styled(
        "  Press any key to close",
        muted(),
    )]));

    let help = Paragraph::new(lines).alignment(Alignment::Left).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Help ")
            .title_style(header())
            .style(border()),
    );

    f.render_widget(help, help_area);
}

pub fn get_keybinding_text() -> String {
    KEYBINDINGS
        .iter()
        .map(|(key, desc)| format!("{:20} - {}", key, desc))
        .collect::<Vec<_>>()
        .join("\n")
}
