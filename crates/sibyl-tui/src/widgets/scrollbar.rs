use ratatui::{layout::Rect, style::Style, Frame};

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
        let y = area.y + 1 + i as u16;
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

#[allow(dead_code)]
pub fn render_scrollbar_track(f: &mut Frame, area: Rect) {
    let scrollbar_height = area.height.saturating_sub(2);
    if scrollbar_height == 0 {
        return;
    }

    let x = area.x + area.width.saturating_sub(1);
    let y = area.y + 1;

    for i in 0..scrollbar_height {
        f.render_widget(
            ratatui::widgets::Paragraph::new("░")
                .style(Style::default().fg(ratatui::style::Color::DarkGray)),
            Rect {
                x,
                y: y + i as u16,
                width: 1,
                height: 1,
            },
        );
    }
}

#[allow(dead_code)]
pub struct ScrollbarState {
    pub offset: usize,
    pub max_offset: usize,
    pub visible: usize,
    pub total: usize,
}

impl ScrollbarState {
    pub fn new() -> Self {
        Self {
            offset: 0,
            max_offset: 0,
            visible: 0,
            total: 0,
        }
    }

    pub fn update(&mut self, total: usize, visible: usize) {
        self.total = total;
        self.visible = visible;
        self.max_offset = total.saturating_sub(visible);
        self.offset = self.offset.min(self.max_offset);
    }

    pub fn scroll_up(&mut self, amount: usize) {
        self.offset = self.offset.saturating_sub(amount);
    }

    pub fn scroll_down(&mut self, amount: usize) {
        self.offset = (self.offset + amount).min(self.max_offset);
    }

    pub fn scroll_to_top(&mut self) {
        self.offset = 0;
    }

    pub fn scroll_to_bottom(&mut self) {
        self.offset = self.max_offset;
    }

    pub fn thumb_position(&self, track_height: usize) -> usize {
        if self.total == 0 || track_height == 0 {
            return 0;
        }

        let thumb_height = self.thumb_height(track_height);
        if self.max_offset == 0 {
            return 0;
        }

        (self.offset * (track_height.saturating_sub(thumb_height))) / self.max_offset
    }

    pub fn thumb_height(&self, track_height: usize) -> usize {
        if self.total == 0 {
            return 0;
        }
        ((self.visible * track_height) / self.total)
            .max(1)
            .min(track_height)
    }
}

impl Default for ScrollbarState {
    fn default() -> Self {
        Self::new()
    }
}
