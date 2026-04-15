use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppMode {
    Chat,
    MemoryView,
    CommandPalette,
    HelpOverlay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppStatus {
    Idle,
    Processing,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub memories_injected: Vec<String>,
}

impl Message {
    pub fn new(role: MessageRole, content: String) -> Self {
        Self {
            role,
            content,
            timestamp: Utc::now(),
            memories_injected: Vec::new(),
        }
    }

    pub fn with_memories(mut self, memories: Vec<String>) -> Self {
        self.memories_injected = memories;
        self
    }
}

#[derive(Debug, Clone)]
pub struct ChatState {
    pub messages: Vec<Message>,
    pub scroll_offset: usize,
    pub streaming: bool,
    pub current_response: Option<String>,
}

impl Default for ChatState {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            scroll_offset: 0,
            streaming: false,
            current_response: None,
        }
    }
}

impl ChatState {
    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
    }

    pub fn clear(&mut self) {
        self.messages.clear();
        self.scroll_offset = 0;
        self.current_response = None;
    }

    pub fn scroll_up(&mut self, amount: usize) {
        self.scroll_offset = self.scroll_offset.saturating_sub(amount);
    }

    pub fn scroll_down(&mut self, amount: usize, max_lines: usize, visible_lines: usize) {
        let max_offset = max_lines.saturating_sub(visible_lines);
        self.scroll_offset = (self.scroll_offset + amount).min(max_offset);
    }
}

#[derive(Debug, Clone)]
pub struct MemoryPanelState {
    pub visible: bool,
    pub results: Vec<String>,
    pub query: String,
    pub scroll_offset: usize,
}

impl Default for MemoryPanelState {
    fn default() -> Self {
        Self {
            visible: false,
            results: Vec::new(),
            query: String::new(),
            scroll_offset: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct InputState {
    pub buffer: String,
    pub cursor_position: usize,
    pub history: Vec<String>,
    pub history_index: Option<usize>,
}

impl Default for InputState {
    fn default() -> Self {
        Self {
            buffer: String::new(),
            cursor_position: 0,
            history: Vec::new(),
            history_index: None,
        }
    }
}

impl InputState {
    pub fn insert_char(&mut self, c: char) {
        self.buffer.insert(self.cursor_position, c);
        self.cursor_position += c.len_utf8();
    }

    pub fn delete_char(&mut self) {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
            self.buffer.remove(self.cursor_position);
        }
    }

    pub fn move_cursor_left(&mut self) {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
        }
    }

    pub fn move_cursor_right(&mut self) {
        if self.cursor_position < self.buffer.len() {
            self.cursor_position += 1;
        }
    }

    pub fn move_cursor_home(&mut self) {
        self.cursor_position = 0;
    }

    pub fn move_cursor_end(&mut self) {
        self.cursor_position = self.buffer.len();
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
        self.cursor_position = 0;
    }

    pub fn submit(&mut self) -> String {
        let content = self.buffer.clone();
        if !content.is_empty() {
            self.history.push(content.clone());
        }
        self.clear();
        self.history_index = None;
        content
    }

    pub fn history_up(&mut self) {
        if self.history.is_empty() {
            return;
        }
        let idx = self.history_index.unwrap_or(self.history.len());
        if idx > 0 {
            self.history_index = Some(idx - 1);
            self.buffer = self.history[idx - 1].clone();
            self.cursor_position = self.buffer.len();
        }
    }

    pub fn history_down(&mut self) {
        if let Some(idx) = self.history_index {
            if idx + 1 < self.history.len() {
                self.history_index = Some(idx + 1);
                self.buffer = self.history[idx + 1].clone();
                self.cursor_position = self.buffer.len();
            } else {
                self.history_index = None;
                self.clear();
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct StatusBarState {
    pub model: String,
    pub session_id: Option<String>,
    pub memory_count: usize,
    pub dep_status: String,
}

impl Default for StatusBarState {
    fn default() -> Self {
        Self {
            model: "sibyl".to_string(),
            session_id: None,
            memory_count: 0,
            dep_status: "Checking dependencies...".to_string(),
        }
    }
}
