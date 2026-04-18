use ratatui::{
    layout::Rect,
    style::Modifier,
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
    let (status_icon, status_text, status_style) = match status {
        AppStatus::Idle => ("●", "Ready", success()),
        AppStatus::Processing => (
            "◐",
            "Processing...",
            warning().add_modifier(Modifier::SLOW_BLINK),
        ),
        AppStatus::Error => ("✗", "Error", error()),
    };

    let session_display = bar_state
        .session_id
        .as_ref()
        .map(|id| {
            if id.len() > 20 {
                format!("ses:{}", &id[4..24])
            } else {
                format!("ses:{}", id)
            }
        })
        .unwrap_or_else(|| "no-ses".to_string());

    let (dep_icon, dep_style) =
        if bar_state.dep_status.contains("ready") || bar_state.dep_status.contains("All") {
            ("●", success())
        } else if bar_state.dep_status.contains("Degraded") {
            ("◐", warning())
        } else if bar_state.dep_status.contains("failed") {
            ("✗", error())
        } else {
            ("○", muted())
        };

    let mem_count = if bar_state.memory_count > 0 {
        format!("{} mem", bar_state.memory_count)
    } else {
        "0 mem".to_string()
    };

    let queue_display = if bar_state.queue_count > 0 {
        format!("queue:{}", bar_state.queue_count)
    } else {
        String::new()
    };

    let spans = if bar_state.queue_count > 0 {
        vec![
            Span::styled(" ", default()),
            Span::styled(&bar_state.model, accent().add_modifier(Modifier::BOLD)),
            Span::styled(" │ ", muted()),
            Span::styled(dep_icon, dep_style),
            Span::styled(" deps", dep_style),
            Span::styled(" │ ", muted()),
            Span::styled(&mem_count, memory_highlight()),
            Span::styled(" │ ", muted()),
            Span::styled(&session_display, accent()),
            Span::styled(" │ ", muted()),
            Span::styled(status_icon, status_style),
            Span::styled(" ", status_style),
            Span::styled(status_text, status_style),
            Span::styled(" │ ", muted()),
            Span::styled(&queue_display, warning()),
            Span::styled(" │ ", muted()),
            Span::styled("[", muted()),
            Span::styled(mode_text, accent()),
            Span::styled("]", muted()),
            Span::styled("  ", default()),
            Span::styled("Tab:Mem ?:Help Ctrl+C:Quit", muted()),
        ]
    } else {
        vec![
            Span::styled(" ", default()),
            Span::styled(&bar_state.model, accent().add_modifier(Modifier::BOLD)),
            Span::styled(" │ ", muted()),
            Span::styled(dep_icon, dep_style),
            Span::styled(" deps", dep_style),
            Span::styled(" │ ", muted()),
            Span::styled(&mem_count, memory_highlight()),
            Span::styled(" │ ", muted()),
            Span::styled(&session_display, accent()),
            Span::styled(" │ ", muted()),
            Span::styled(status_icon, status_style),
            Span::styled(" ", status_style),
            Span::styled(status_text, status_style),
            Span::styled(" │ ", muted()),
            Span::styled("[", muted()),
            Span::styled(mode_text, accent()),
            Span::styled("]", muted()),
            Span::styled("  ", default()),
            Span::styled("Tab:Mem ?:Help Ctrl+C:Quit", muted()),
        ]
    };

    let status = Paragraph::new(Line::from(spans)).style(default());
    f.render_widget(status, area);
}
