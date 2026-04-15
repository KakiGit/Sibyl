use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::{AppStatus, StatusBarState};
use crate::theme::*;

pub fn render_status_bar(
    f: &mut Frame,
    area: Rect,
    status: AppStatus,
    bar_state: &StatusBarState,
    mode_text: &str,
) {
    let status_text = match status {
        AppStatus::Idle => "● Ready",
        AppStatus::Processing => "◐ Processing...",
        AppStatus::Error => "✗ Error",
    };

    let status_style = match status {
        AppStatus::Idle => success(),
        AppStatus::Processing => warning().add_modifier(Modifier::SLOW_BLINK),
        AppStatus::Error => error(),
    };

    let session_info = bar_state
        .session_id
        .as_ref()
        .map(|id| format!("Session: {} | ", id.chars().take(8).collect::<String>()))
        .unwrap_or_else(|| "No session | ".to_string());

    let memory_info = if bar_state.memory_count > 0 {
        format!("{} memories | ", bar_state.memory_count)
    } else {
        String::new()
    };

    let model_info = format!("{} | ", bar_state.model);

    let dep_info = if bar_state.dep_status.contains("ready") || bar_state.dep_status.contains("All")
    {
        format!("{} | ", bar_state.dep_status)
    } else if bar_state.dep_status.contains("Degraded") {
        format!("{} | ", bar_state.dep_status)
    } else {
        format!("{} | ", bar_state.dep_status)
    };

    let dep_style =
        if bar_state.dep_status.contains("ready") || bar_state.dep_status.contains("All") {
            success()
        } else if bar_state.dep_status.contains("Degraded") {
            warning()
        } else if bar_state.dep_status.contains("failed") {
            error()
        } else {
            muted()
        };

    let mut spans = vec![
        Span::styled(&model_info, accent()),
        Span::styled(&dep_info, dep_style),
        Span::styled(&session_info, muted()),
        Span::styled(&memory_info, memory_highlight()),
        Span::styled(status_text, status_style),
        Span::styled(" | ", muted()),
        Span::styled(mode_text, accent()),
    ];

    let help_text = " | Tab: Memory | ?: Help | Ctrl+C: Quit";
    spans.push(Span::styled(help_text, muted()));

    let status = Paragraph::new(Line::from(spans)).style(default());
    f.render_widget(status, area);
}
