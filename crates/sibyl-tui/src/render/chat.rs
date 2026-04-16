use ratatui::{
    layout::Rect,
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::app::{ChatState, Message, MessageRole};
use crate::theme::*;
use crate::widgets::scrollbar::render_scrollbar;

pub fn render_chat(f: &mut Frame, state: &ChatState, area: Rect, processing: bool) {
    if state.messages.is_empty() && !processing {
        render_welcome(f, area);
        return;
    }

    let has_scrollbar = needs_scrollbar(state, area.height as usize);
    let list_area = if has_scrollbar {
        Rect {
            width: area.width.saturating_sub(1),
            ..area
        }
    } else {
        area
    };

    let total_lines = calculate_total_lines(state, list_area.width as usize);
    let visible_lines = (list_area.height as usize).saturating_sub(2);

    let scroll_offset = state
        .scroll_offset
        .min(total_lines.saturating_sub(visible_lines));

    let mut items: Vec<ListItem> = state
        .messages
        .iter()
        .flat_map(|msg| render_message_lines(msg, list_area.width as usize))
        .skip(scroll_offset)
        .take(visible_lines)
        .collect();

    if processing {
        items.push(ListItem::new(Line::from(vec![
            Span::styled("⠋ ", warning()),
            Span::styled(
                "Processing...",
                warning().add_modifier(Modifier::SLOW_BLINK),
            ),
        ])));
    }

    let chat = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Chat ")
            .title_style(header())
            .style(border()),
    );
    f.render_widget(chat, list_area);

    if has_scrollbar {
        render_scrollbar(f, area, scroll_offset, total_lines, visible_lines);
    }
}

fn render_welcome(f: &mut Frame, area: Rect) {
    let welcome_lines = vec![
        Line::from(""),
        Line::from(vec![Span::styled("Welcome to Sibyl", header())]),
        Line::from(vec![Span::styled(
            "Your memory-enhanced AI assistant",
            accent(),
        )]),
        Line::from(""),
        Line::from(vec![Span::styled("Quick Start:", muted())]),
        Line::from(vec![
            Span::styled("  • ", muted()),
            Span::styled("Type a message and press Enter", default()),
        ]),
        Line::from(vec![
            Span::styled("  • ", muted()),
            Span::styled("Press Tab to toggle memory panel", default()),
        ]),
        Line::from(vec![
            Span::styled("  • ", muted()),
            Span::styled("Press ? for help", default()),
        ]),
        Line::from(vec![
            Span::styled("  • ", muted()),
            Span::styled("Press : for command palette", default()),
        ]),
        Line::from(""),
        Line::from(vec![Span::styled(
            "Commands: /help, /memory <query>, /clear",
            muted(),
        )]),
        Line::from(""),
    ];

    let welcome = Paragraph::new(welcome_lines)
        .alignment(ratatui::layout::Alignment::Center)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Chat ")
                .title_style(header())
                .style(border()),
        );
    f.render_widget(welcome, area);
}

fn render_message_lines(msg: &Message, width: usize) -> Vec<ListItem<'static>> {
    let style = match msg.role {
        MessageRole::User => user_message(),
        MessageRole::Assistant => assistant_message(),
        MessageRole::System => system_message(),
    };

    let prefix = match msg.role {
        MessageRole::User => "You: ",
        MessageRole::Assistant => "Sibyl: ",
        MessageRole::System => "System: ",
    };

    let prefix_style = style.add_modifier(Modifier::BOLD);

    let wrapped_lines = wrap_text_simple(&msg.content, width.saturating_sub(prefix.len() + 2));
    let mut items = Vec::new();

    for (i, line_text) in wrapped_lines.into_iter().enumerate() {
        if i == 0 {
            items.push(ListItem::new(Line::from(vec![
                Span::styled(prefix, prefix_style),
                Span::styled(line_text, style),
            ])));
        } else {
            items.push(ListItem::new(Line::from(Span::styled(line_text, style))));
        }
    }

    if !msg.memories_injected.is_empty() {
        items.push(ListItem::new(Line::from(Span::styled(
            format!("  [{} memories injected]", msg.memories_injected.len()),
            memory_highlight().add_modifier(Modifier::ITALIC),
        ))));
    }

    items
}

fn wrap_text_simple(text: &str, max_width: usize) -> Vec<String> {
    if max_width == 0 {
        return text.lines().map(String::from).collect();
    }

    let mut result = Vec::new();

    for line in text.lines() {
        if line.is_empty() {
            result.push(String::new());
            continue;
        }

        let mut current_line = String::new();
        for word in line.split_whitespace() {
            if current_line.is_empty() {
                current_line = word.to_string();
            } else if current_line.len() + 1 + word.len() <= max_width {
                current_line.push(' ');
                current_line.push_str(word);
            } else {
                result.push(current_line);
                current_line = word.to_string();
            }
        }
        if !current_line.is_empty() {
            result.push(current_line);
        }
    }

    result
}

fn calculate_total_lines(state: &ChatState, width: usize) -> usize {
    state
        .messages
        .iter()
        .map(|msg| count_message_lines(msg, width))
        .sum()
}

fn count_message_lines(msg: &Message, width: usize) -> usize {
    let wrapped = wrap_text_simple(&msg.content, width.saturating_sub(6));
    let extra = if msg.memories_injected.is_empty() {
        0
    } else {
        1
    };
    wrapped.len() + extra
}

fn needs_scrollbar(state: &ChatState, height: usize) -> bool {
    let total_lines: usize = state
        .messages
        .iter()
        .map(|m| m.content.lines().count())
        .sum();
    total_lines > height.saturating_sub(2)
}

pub fn render_streaming_indicator(f: &mut Frame, area: Rect) {
    let indicator = Paragraph::new("...")
        .style(assistant_message().add_modifier(Modifier::BOLD))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Streaming ")
                .style(border()),
        );
    f.render_widget(indicator, area);
}
