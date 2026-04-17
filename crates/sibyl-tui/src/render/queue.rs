use crate::app::QueuePanelState;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::Line,
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

pub fn render_queue_panel(f: &mut Frame, queue: &QueuePanelState, area: Rect) {
    if queue.is_empty() {
        return;
    }

    let title = format!(" Queued ({}) ", queue.count());

    let block = Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(Color::Yellow))
        .title(title);

    let messages: Vec<ListItem> = queue
        .messages
        .iter()
        .enumerate()
        .map(|(i, msg)| {
            let style = if Some(i) == queue.selected_index {
                Style::default().fg(Color::Yellow).bg(Color::DarkGray)
            } else {
                Style::default().fg(Color::Gray)
            };
            let truncated = if msg.len() > 50 {
                format!("{}...", &msg[..47])
            } else {
                msg.clone()
            };
            ListItem::new(Line::styled(format!("{}. {}", i + 1, truncated), style))
        })
        .collect();

    let list = List::new(messages).block(block);
    f.render_widget(list, area);
}

pub fn render_queue_indicator(f: &mut Frame, count: usize, area: Rect) {
    if count == 0 {
        return;
    }

    let text = format!(" {} queued ", count);
    let paragraph = Paragraph::new(text).style(Style::default().fg(Color::Yellow));
    f.render_widget(paragraph, area);
}
