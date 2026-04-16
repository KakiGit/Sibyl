use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComposerAction {
    InsertChar(char),
    DeleteChar,
    DeleteWord,
    DeleteLine,
    MoveLeft,
    MoveRight,
    MoveWordLeft,
    MoveWordRight,
    MoveToStart,
    MoveToEnd,
    NewLine,
    Submit,
    HistoryUp,
    HistoryDown,
    Clear,
    None,
}

pub struct InputComposer {
    buffer: String,
    cursor: usize,
    history: Vec<String>,
    history_index: Option<usize>,
}

impl Default for InputComposer {
    fn default() -> Self {
        Self::new()
    }
}

impl InputComposer {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            cursor: 0,
            history: Vec::new(),
            history_index: None,
        }
    }

    pub fn buffer(&self) -> &str {
        &self.buffer
    }

    pub fn cursor(&self) -> usize {
        self.cursor
    }

    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    pub fn handle_key(&mut self, key: KeyEvent) -> ComposerAction {
        match key.code {
            KeyCode::Char(c) => {
                if key.modifiers.contains(KeyModifiers::CONTROL) {
                    match c {
                        'a' => ComposerAction::MoveToStart,
                        'e' => ComposerAction::MoveToEnd,
                        'w' => ComposerAction::DeleteWord,
                        'u' => ComposerAction::DeleteLine,
                        _ => ComposerAction::None,
                    }
                } else {
                    self.insert_char(c);
                    ComposerAction::InsertChar(c)
                }
            }
            KeyCode::Backspace => {
                self.delete_char();
                ComposerAction::DeleteChar
            }
            KeyCode::Delete => {
                self.delete_forward();
                ComposerAction::DeleteChar
            }
            KeyCode::Left => {
                if key.modifiers.contains(KeyModifiers::ALT) {
                    ComposerAction::MoveWordLeft
                } else {
                    self.move_left();
                    ComposerAction::MoveLeft
                }
            }
            KeyCode::Right => {
                if key.modifiers.contains(KeyModifiers::ALT) {
                    ComposerAction::MoveWordRight
                } else {
                    self.move_right();
                    ComposerAction::MoveRight
                }
            }
            KeyCode::Home => ComposerAction::MoveToStart,
            KeyCode::End => ComposerAction::MoveToEnd,
            KeyCode::Up => ComposerAction::HistoryUp,
            KeyCode::Down => ComposerAction::HistoryDown,
            KeyCode::Enter => {
                if key.modifiers.contains(KeyModifiers::ALT) {
                    self.insert_char('\n');
                    ComposerAction::NewLine
                } else {
                    ComposerAction::Submit
                }
            }
            KeyCode::Esc => ComposerAction::Clear,
            _ => ComposerAction::None,
        }
    }

    pub fn insert_char(&mut self, c: char) {
        self.buffer.insert(self.cursor, c);
        self.cursor += c.len_utf8();
    }

    pub fn delete_char(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
            self.buffer.remove(self.cursor);
        }
    }

    pub fn delete_forward(&mut self) {
        if self.cursor < self.buffer.len() {
            self.buffer.remove(self.cursor);
        }
    }

    pub fn delete_word(&mut self) {
        let start = self.cursor;
        let mut end = self.cursor;

        while end > 0 && self.buffer.chars().nth(end - 1) == Some(' ') {
            end -= 1;
        }
        while end > 0 && self.buffer.chars().nth(end - 1) != Some(' ') {
            end -= 1;
        }

        self.buffer.replace_range(end..start, "");
        self.cursor = end;
    }

    pub fn delete_line(&mut self) {
        self.buffer.clear();
        self.cursor = 0;
    }

    pub fn move_left(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    pub fn move_right(&mut self) {
        if self.cursor < self.buffer.len() {
            self.cursor += 1;
        }
    }

    pub fn move_word_left(&mut self) {
        while self.cursor > 0 && self.buffer.chars().nth(self.cursor - 1) == Some(' ') {
            self.cursor -= 1;
        }
        while self.cursor > 0 && self.buffer.chars().nth(self.cursor - 1) != Some(' ') {
            self.cursor -= 1;
        }
    }

    pub fn move_word_right(&mut self) {
        while self.cursor < self.buffer.len() && self.buffer.chars().nth(self.cursor) == Some(' ') {
            self.cursor += 1;
        }
        while self.cursor < self.buffer.len() && self.buffer.chars().nth(self.cursor) != Some(' ') {
            self.cursor += 1;
        }
    }

    pub fn move_to_start(&mut self) {
        self.cursor = 0;
    }

    pub fn move_to_end(&mut self) {
        self.cursor = self.buffer.len();
    }

    pub fn submit(&mut self) -> String {
        let content = self.buffer.clone();
        if !content.is_empty() {
            self.history.push(content.clone());
        }
        self.clear();
        content
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
        self.cursor = 0;
        self.history_index = None;
    }

    pub fn history_up(&mut self) {
        if self.history.is_empty() {
            return;
        }
        let idx = self.history_index.unwrap_or(self.history.len());
        if idx > 0 {
            self.history_index = Some(idx - 1);
            self.buffer = self.history[idx - 1].clone();
            self.cursor = self.buffer.len();
        }
    }

    pub fn history_down(&mut self) {
        if let Some(idx) = self.history_index {
            if idx + 1 < self.history.len() {
                self.history_index = Some(idx + 1);
                self.buffer = self.history[idx + 1].clone();
                self.cursor = self.buffer.len();
            } else {
                self.history_index = None;
                self.clear();
            }
        }
    }

    pub fn set_buffer(&mut self, text: String) {
        self.buffer = text;
        self.cursor = self.buffer.len();
    }
}
