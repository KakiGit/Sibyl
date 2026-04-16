use ratatui::{
    layout::Rect,
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::app::MemoryPanelState;
use crate::theme::*;
use crate::widgets::scrollbar::render_scrollbar;

pub fn render_memory_panel(f: &mut Frame, state: &MemoryPanelState, area: Rect) {
    if state.results.is_empty() {
        render_empty_memory_panel(f, area);
        return;
    }

    let has_scrollbar = state.results.len() > area.height.saturating_sub(2) as usize;
    let list_area = if has_scrollbar {
        Rect {
            width: area.width.saturating_sub(1),
            ..area
        }
    } else {
        area
    };

    let visible_items = (list_area.height as usize).saturating_sub(2);
    let total_items = state.results.len();
    let scroll_offset = state
        .scroll_offset
        .min(total_items.saturating_sub(visible_items));

    let items: Vec<ListItem> = state
        .results
        .iter()
        .skip(scroll_offset)
        .take(visible_items)
        .enumerate()
        .map(|(i, mem)| {
            let style = if i == 0 {
                memory_highlight().add_modifier(Modifier::BOLD)
            } else {
                memory_highlight()
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{}. ", i + scroll_offset + 1), muted()),
                Span::styled(mem, style),
            ]))
        })
        .collect();

    let memory = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Memory ")
            .title_style(header())
            .style(border()),
    );
    f.render_widget(memory, list_area);

    if has_scrollbar {
        render_scrollbar(f, area, scroll_offset, total_items, visible_items);
    }
}

pub fn render_memory_search_input(f: &mut Frame, query: &str, area: Rect, focused: bool) {
    let style = if focused { border_focused() } else { border() };

    let input = Paragraph::new(query).style(default()).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Search Memory ")
            .title_style(if focused { header() } else { muted() })
            .style(style),
    );
    f.render_widget(input, area);
}

pub fn render_empty_memory_panel(f: &mut Frame, area: Rect) {
    let empty_lines = vec![
        Line::from(""),
        Line::from(vec![Span::styled("Memory Panel", header())]),
        Line::from(""),
        Line::from(vec![Span::styled("No memories yet", muted())]),
        Line::from(""),
        Line::from(vec![Span::styled(
            "Memories are automatically stored",
            accent(),
        )]),
        Line::from(vec![Span::styled("when you send messages.", accent())]),
        Line::from(""),
        Line::from(vec![Span::styled("Press Tab to close", muted())]),
        Line::from(""),
    ];

    let empty = Paragraph::new(empty_lines)
        .alignment(ratatui::layout::Alignment::Center)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Memory ")
                .title_style(header())
                .style(border()),
        );
    f.render_widget(empty, area);
}
