use ratatui::{
    layout::Rect,
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem},
    Frame,
};

use crate::theme::{accent, border_focused, default, muted};

pub struct CompletionPopup {
    completions: Vec<String>,
    selected: usize,
    visible: bool,
}

impl Default for CompletionPopup {
    fn default() -> Self {
        Self::new()
    }
}

impl CompletionPopup {
    pub fn new() -> Self {
        Self {
            completions: Vec::new(),
            selected: 0,
            visible: false,
        }
    }

    pub fn set_completions(&mut self, completions: Vec<String>) {
        self.completions = completions;
        self.selected = 0;
        self.visible = !self.completions.is_empty();
    }

    #[allow(dead_code)]
    pub fn show(&mut self) {
        self.visible = !self.completions.is_empty();
    }

    pub fn hide(&mut self) {
        self.visible = false;
    }

    pub fn is_visible(&self) -> bool {
        self.visible && !self.completions.is_empty()
    }

    pub fn select_next(&mut self) {
        if !self.completions.is_empty() {
            self.selected = (self.selected + 1) % self.completions.len();
        }
    }

    pub fn select_prev(&mut self) {
        if !self.completions.is_empty() {
            self.selected = if self.selected == 0 {
                self.completions.len() - 1
            } else {
                self.selected - 1
            };
        }
    }

    pub fn selected_completion(&self) -> Option<&str> {
        self.completions.get(self.selected).map(|s| s.as_str())
    }

    pub fn render(&self, f: &mut Frame, area: Rect, input_y: u16) {
        if !self.is_visible() {
            return;
        }

        let height = self.completions.len().min(5) as u16 + 2;
        let popup_area = Rect {
            x: area.x,
            y: input_y.saturating_sub(height),
            width: area.width.min(40),
            height,
        };

        f.render_widget(Clear, popup_area);

        let items: Vec<ListItem> = self
            .completions
            .iter()
            .enumerate()
            .map(|(i, completion)| {
                let style = if i == self.selected {
                    accent().add_modifier(Modifier::BOLD)
                } else {
                    default()
                };
                ListItem::new(Line::from(Span::styled(completion, style)))
            })
            .collect();

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Completions ")
                .title_style(muted())
                .style(border_focused()),
        );

        f.render_widget(list, popup_area);
    }
}

#[allow(dead_code)]
pub fn filter_completions(candidates: &[&str], prefix: &str) -> Vec<String> {
    candidates
        .iter()
        .filter(|c| c.starts_with(prefix))
        .map(|s| s.to_string())
        .collect()
}
