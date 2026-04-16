use ratatui::{
    layout::{Alignment, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

use crate::input::get_command_help;
use crate::theme::{accent, border, default, header, muted, success};

const KEYBINDINGS: &[(&str, &str)] = &[
    ("Enter", "Send message"),
    ("Up / Down", "Scroll chat history"),
    ("Alt+j / Alt+k", "Scroll (vim-style)"),
    ("Ctrl+d / Ctrl+u", "Half-page scroll"),
    ("Tab", "Toggle memory panel"),
    ("?", "Show this help"),
    (":", "Command palette"),
    ("Esc", "Close overlay/cancel"),
    ("Ctrl+c", "Quit Sibyl"),
];

pub fn render_help_overlay(f: &mut Frame, area: Rect) {
    let help_width = 65u16;
    let cmd_help = get_command_help();
    let help_height = (KEYBINDINGS.len() + cmd_help.len() + 8) as u16;

    let help_area = Rect {
        x: (area.width.saturating_sub(help_width)) / 2,
        y: (area.height.saturating_sub(help_height)) / 2,
        width: help_width.min(area.width),
        height: help_height.min(area.height),
    };

    f.render_widget(Clear, help_area);

    let mut lines: Vec<Line<'static>> = Vec::new();

    lines.push(Line::from(""));
    lines.push(Line::from(vec![Span::styled(
        "  ╔══ Key Bindings ═══════════════════════╗",
        accent(),
    )]));
    lines.push(Line::from(vec![
        Span::styled("  ║", accent()),
        Span::styled("                                  ", default()),
        Span::styled("║", accent()),
    ]));

    for (key, desc) in KEYBINDINGS {
        lines.push(Line::from(vec![
            Span::styled("  ║ ", accent()),
            Span::styled(
                format!("{:18} ", key),
                accent().add_modifier(Modifier::BOLD),
            ),
            Span::styled(format!("→ {}", desc), default()),
            Span::styled("       ║", accent()),
        ]));
    }

    lines.push(Line::from(vec![Span::styled(
        "  ╚══════════════════════════════════════╝",
        accent(),
    )]));
    lines.push(Line::from(""));
    lines.push(Line::from(vec![Span::styled(
        "  ╔══ Commands ═══════════════════════════╗",
        accent(),
    )]));
    lines.push(Line::from(vec![
        Span::styled("  ║", accent()),
        Span::styled("                                  ", default()),
        Span::styled("║", accent()),
    ]));

    for (cmd, desc) in cmd_help.iter() {
        lines.push(Line::from(vec![
            Span::styled("  ║ ", accent()),
            Span::styled(
                format!("{:22} ", cmd),
                accent().add_modifier(Modifier::BOLD),
            ),
            Span::styled(format!("→ {}", desc), default()),
            Span::styled("   ║", accent()),
        ]));
    }

    lines.push(Line::from(vec![Span::styled(
        "  ╚══════════════════════════════════════╝",
        accent(),
    )]));
    lines.push(Line::from(""));
    lines.push(Line::from(vec![
        Span::styled("  ", default()),
        Span::styled(
            "Press any key to close",
            muted().add_modifier(Modifier::ITALIC),
        ),
    ]));

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
        .map(|(key, desc)| format!("{:18} → {}", key, desc))
        .collect::<Vec<_>>()
        .join("\n")
}
