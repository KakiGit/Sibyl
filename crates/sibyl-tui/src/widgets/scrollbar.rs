use ratatui::{layout::Rect, Frame};

use crate::theme::muted;

pub fn render_scrollbar(
    f: &mut Frame,
    area: Rect,
    scroll_offset: usize,
    total_items: usize,
    visible_items: usize,
) {
    if total_items == 0 || visible_items >= total_items {
        return;
    }

    let scrollbar_height = area.height.saturating_sub(2);
    if scrollbar_height == 0 {
        return;
    }

    let thumb_height = ((visible_items * scrollbar_height as usize) / total_items)
        .max(1)
        .min(scrollbar_height as usize);

    let thumb_position = if total_items > visible_items {
        (scroll_offset * (scrollbar_height as usize - thumb_height)) / (total_items - visible_items)
    } else {
        0
    };

    for i in 0..scrollbar_height {
        let y = area.y + 1 + i;
        let x = area.x + area.width.saturating_sub(1);

        let char = if i as usize >= thumb_position && (i as usize) < thumb_position + thumb_height {
            '█'
        } else {
            '░'
        };

        f.render_widget(
            ratatui::widgets::Paragraph::new(char.to_string()).style(muted()),
            Rect {
                x,
                y,
                width: 1,
                height: 1,
            },
        );
    }
}
