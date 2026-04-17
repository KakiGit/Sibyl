use chrono::{DateTime, Utc};
use tokio::sync::mpsc::{Receiver, Sender};

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
    pub pending: bool,
}

impl Message {
    pub fn new(role: MessageRole, content: String) -> Self {
        Self {
            role,
            content,
            timestamp: Utc::now(),
            memories_injected: Vec::new(),
            pending: false,
        }
    }

    pub fn with_memories(mut self, memories: Vec<String>) -> Self {
        self.memories_injected = memories;
        self
    }

    pub fn pending(mut self) -> Self {
        self.pending = true;
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

    pub fn start_streaming(&mut self) {
        self.streaming = true;
        self.current_response = Some(String::new());
    }

    pub fn append_stream(&mut self, delta: &str) {
        if let Some(ref mut response) = self.current_response {
            response.push_str(delta);
        }
    }

    pub fn finish_stream(&mut self, content: String) {
        self.streaming = false;
        self.current_response = None;
        self.add_message(Message::new(MessageRole::Assistant, content));
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
pub struct QueuePanelState {
    pub messages: Vec<String>,
    pub selected_index: Option<usize>,
}

impl Default for QueuePanelState {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            selected_index: None,
        }
    }
}

impl QueuePanelState {
    pub fn add(&mut self, text: String) {
        self.messages.push(text);
    }

    pub fn remove_selected(&mut self) -> Option<String> {
        if let Some(idx) = self.selected_index {
            if idx < self.messages.len() {
                self.messages.remove(idx);
                self.selected_index = if self.messages.is_empty() {
                    None
                } else {
                    Some(idx.min(self.messages.len() - 1))
                };
            }
        }
        None
    }

    pub fn clear(&mut self) {
        self.messages.clear();
        self.selected_index = None;
    }

    pub fn select_up(&mut self) {
        if !self.messages.is_empty() {
            self.selected_index = Some(self.selected_index.map_or(0, |i| i.saturating_sub(1)));
        }
    }

    pub fn select_down(&mut self) {
        if !self.messages.is_empty() {
            let max = self.messages.len() - 1;
            self.selected_index = Some(
                self.selected_index
                    .map_or(0, |i| i.min(max).saturating_add(1)),
            );
        }
    }

    pub fn is_empty(&self) -> bool {
        self.messages.is_empty()
    }

    pub fn count(&self) -> usize {
        self.messages.len()
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
    pub queue_count: usize,
    pub streaming: bool,
}

impl Default for StatusBarState {
    fn default() -> Self {
        Self {
            model: "sibyl".to_string(),
            session_id: None,
            memory_count: 0,
            dep_status: "Checking dependencies...".to_string(),
            queue_count: 0,
            streaming: false,
        }
    }
}

use crossterm::event::KeyEvent;
use sibyl_deps::{DependencyManager, SibylConfig};
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::config::OpenCodeConfig;
use std::sync::Arc;

use crate::background::{BackgroundCommand, UiEvent};
use crate::input::{
    get_command_completions, handle_chat_key, handle_global_key, handle_memory_key,
    should_handle_as_input, Command, HandleResult, InputComposer,
};
use crate::widgets::{CompletionPopup, Spinner, SpinnerState};

pub struct App {
    mode: AppMode,
    status: AppStatus,
    chat: ChatState,
    memory: MemoryPanelState,
    queue: QueuePanelState,
    input: InputState,
    status_bar: StatusBarState,
    composer: InputComposer,
    spinner: Spinner,
    completion: CompletionPopup,
    bg_tx: Sender<BackgroundCommand>,
    ui_rx: Receiver<UiEvent>,
    session_id: Option<String>,
    session_busy: bool,
    deps: Arc<DependencyManager>,
    config: SibylConfig,
}

impl App {
    pub fn new(
        deps: Arc<DependencyManager>,
        config: SibylConfig,
        bg_tx: Sender<BackgroundCommand>,
        ui_rx: Receiver<UiEvent>,
    ) -> Self {
        Self {
            mode: AppMode::Chat,
            status: AppStatus::Idle,
            chat: ChatState::default(),
            memory: MemoryPanelState::default(),
            queue: QueuePanelState::default(),
            input: InputState::default(),
            status_bar: StatusBarState {
                model: config.harness.opencode.model.clone(),
                ..Default::default()
            },
            composer: InputComposer::new(),
            spinner: Spinner::new(),
            completion: CompletionPopup::new(),
            bg_tx,
            ui_rx,
            session_id: None,
            session_busy: false,
            deps,
            config,
        }
    }

    pub fn mode(&self) -> AppMode {
        self.mode
    }

    pub fn status(&self) -> AppStatus {
        self.status
    }

    pub fn chat(&self) -> &ChatState {
        &self.chat
    }

    pub fn memory(&self) -> &MemoryPanelState {
        &self.memory
    }

    pub fn queue(&self) -> &QueuePanelState {
        &self.queue
    }

    pub fn memory_visible(&self) -> bool {
        self.memory.visible
    }

    pub fn input_state(&self) -> InputState {
        InputState {
            buffer: self.composer.buffer().to_string(),
            cursor_position: self.composer.cursor(),
            history: self.input.history.clone(),
            history_index: self.input.history_index,
        }
    }

    pub fn status_bar(&self) -> &StatusBarState {
        &self.status_bar
    }

    pub fn deps(&self) -> Arc<DependencyManager> {
        self.deps.clone()
    }

    pub fn set_dep_status(&mut self, status: String) {
        self.status_bar.dep_status = status;
    }

    pub fn tick_spinner(&mut self) {
        self.spinner.tick();
    }

    pub fn spinner_char(&self) -> &'static str {
        self.spinner.current_str()
    }

    pub fn process_events(&mut self) {
        let mut count = 0;
        while let Ok(event) = self.ui_rx.try_recv() {
            tracing::info!("Received UI event: {:?}", event);
            self.handle_ui_event(event);
            count += 1;
        }
        if count > 0 {
            tracing::info!("Processed {} UI events", count);
        }
    }

    fn handle_ui_event(&mut self, event: UiEvent) {
        match event {
            UiEvent::SessionIdle { session_id } => {
                self.session_busy = false;
                self.session_id = Some(session_id.clone());
                self.status_bar.session_id = Some(session_id);
                self.status_bar.streaming = false;
                self.status = AppStatus::Idle;
                self.spinner.stop();

                if self.chat.streaming {
                    let content = self.chat.current_response.clone().unwrap_or_default();
                    self.chat.finish_stream(content);
                }

                tracing::info!("Session idle, queue count: {}", self.queue.count());
                if !self.queue.is_empty() && self.queue.messages.first().is_some() {
                    let next_msg = self.queue.messages.remove(0);
                    tracing::info!("Sending queued message: {}", next_msg);
                    self.status_bar.queue_count = self.queue.count();
                    let _ = self.bg_tx.blocking_send(BackgroundCommand::SendMessage {
                        text: next_msg,
                        session_id: self.session_id.clone(),
                    });
                    self.session_busy = true;
                    self.chat.start_streaming();
                    self.status_bar.streaming = true;
                } else {
                    tracing::info!("No queued messages to send");
                }
            }
            UiEvent::SessionBusy { session_id } => {
                self.session_busy = true;
                self.session_id = Some(session_id);
                self.status = AppStatus::Processing;
                self.spinner.start(SpinnerState::Processing);
                if !self.chat.streaming {
                    self.chat.start_streaming();
                    self.status_bar.streaming = true;
                }
            }
            UiEvent::MessageCreated { role, .. } => if role == "user" {},
            UiEvent::MessagePartDelta { delta, .. } => {
                self.chat.append_stream(&delta);
            }
            UiEvent::MessagePartComplete { content, .. } => {
                self.chat.finish_stream(content);
            }
            UiEvent::MessageComplete { .. } => {
                self.chat.streaming = false;
                self.status_bar.streaming = false;
            }
            UiEvent::ToolUse { tool, status, .. } => {
                if status == "completed" {
                    let msg =
                        Message::new(MessageRole::System, format!("Tool '{}' completed", tool));
                    self.chat.add_message(msg);
                } else if status == "error" {
                    let msg = Message::new(MessageRole::System, format!("Tool '{}' failed", tool));
                    self.chat.add_message(msg);
                }
            }
            UiEvent::Error { message, .. } => {
                let msg = Message::new(MessageRole::System, format!("Error: {}", message));
                self.chat.add_message(msg);
                self.status = AppStatus::Error;
            }
            UiEvent::MemoryRetrieved { memories } => {
                self.memory.results = memories.clone();
                self.status_bar.memory_count = memories.len();
            }
            _ => {}
        }
    }

    #[allow(dead_code)]
    pub fn render_completion(&self, f: &mut ratatui::Frame, area: ratatui::layout::Rect) {
        self.completion.render(f, area, area.y);
    }

    pub fn handle_key(&mut self, key: KeyEvent) -> bool {
        if self.mode == AppMode::HelpOverlay {
            self.mode = AppMode::Chat;
            return true;
        }

        let global_result = handle_global_key(key, self.mode);
        match global_result {
            HandleResult::Quit => return false,
            HandleResult::SwitchMode(mode) => {
                self.mode = mode;
                return true;
            }
            HandleResult::ToggleMemoryPanel => {
                self.memory.visible = !self.memory.visible;
                if self.memory.visible {
                    self.mode = AppMode::MemoryView;
                } else {
                    self.mode = AppMode::Chat;
                }
                return true;
            }
            HandleResult::ShowHelp => {
                self.mode = AppMode::HelpOverlay;
                return true;
            }
            HandleResult::HideHelp => {
                self.mode = AppMode::Chat;
                return true;
            }
            HandleResult::ClearChat => {
                self.chat.clear();
                return true;
            }
            _ => {}
        }

        match self.mode {
            AppMode::Chat => self.handle_chat_mode(key),
            AppMode::MemoryView => self.handle_memory_mode(key),
            AppMode::CommandPalette => self.handle_command_mode(key),
            AppMode::HelpOverlay => {}
        }

        true
    }

    fn handle_chat_mode(&mut self, key: KeyEvent) {
        let result = handle_chat_key(key);
        match result {
            HandleResult::ScrollDown(n) => {
                let total: usize = self
                    .chat
                    .messages
                    .iter()
                    .map(|m| m.content.lines().count())
                    .sum();
                let visible = 20;
                self.chat.scroll_down(n, total, visible);
            }
            HandleResult::ScrollUp(n) => {
                self.chat.scroll_up(n);
            }
            HandleResult::SubmitInput => {
                self.submit_input();
            }
            HandleResult::SwitchMode(mode) => {
                self.mode = mode;
            }
            _ => {
                if should_handle_as_input(key, self.mode) {
                    let action = self.composer.handle_key(key);
                    match action {
                        crate::input::ComposerAction::HistoryUp => {
                            self.composer.history_up();
                        }
                        crate::input::ComposerAction::HistoryDown => {
                            self.composer.history_down();
                        }
                        crate::input::ComposerAction::MoveWordLeft => {
                            self.composer.move_word_left();
                        }
                        crate::input::ComposerAction::MoveWordRight => {
                            self.composer.move_word_right();
                        }
                        crate::input::ComposerAction::MoveToStart => {
                            self.composer.move_to_start();
                        }
                        crate::input::ComposerAction::MoveToEnd => {
                            self.composer.move_to_end();
                        }
                        crate::input::ComposerAction::DeleteWord => {
                            self.composer.delete_word();
                        }
                        crate::input::ComposerAction::DeleteLine => {
                            self.composer.delete_line();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    fn handle_memory_mode(&mut self, key: KeyEvent) {
        let result = handle_memory_key(key);
        match result {
            HandleResult::ScrollDown(n) => {
                self.memory.scroll_offset = self.memory.scroll_offset.saturating_add(n);
            }
            HandleResult::ScrollUp(n) => {
                self.memory.scroll_offset = self.memory.scroll_offset.saturating_sub(n);
            }
            HandleResult::ToggleMemoryPanel => {
                self.memory.visible = false;
                self.mode = AppMode::Chat;
            }
            HandleResult::SwitchMode(mode) => {
                self.mode = mode;
            }
            _ => {
                if should_handle_as_input(key, self.mode) {
                    let action = self.composer.handle_key(key);
                    match action {
                        crate::input::ComposerAction::HistoryUp => {
                            self.composer.history_up();
                        }
                        crate::input::ComposerAction::HistoryDown => {
                            self.composer.history_down();
                        }
                        crate::input::ComposerAction::MoveWordLeft => {
                            self.composer.move_word_left();
                        }
                        crate::input::ComposerAction::MoveWordRight => {
                            self.composer.move_word_right();
                        }
                        crate::input::ComposerAction::MoveToStart => {
                            self.composer.move_to_start();
                        }
                        crate::input::ComposerAction::MoveToEnd => {
                            self.composer.move_to_end();
                        }
                        crate::input::ComposerAction::DeleteWord => {
                            self.composer.delete_word();
                        }
                        crate::input::ComposerAction::DeleteLine => {
                            self.composer.delete_line();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    fn handle_command_mode(&mut self, key: KeyEvent) {
        use crossterm::event::KeyCode;
        match key.code {
            KeyCode::Esc => {
                self.mode = AppMode::Chat;
                self.composer.clear();
                self.completion.hide();
            }
            KeyCode::Enter => {
                let cmd_text = self.composer.submit();
                self.execute_command(&cmd_text);
                self.mode = AppMode::Chat;
                self.completion.hide();
            }
            KeyCode::Tab => {
                if self.completion.is_visible() {
                    if let Some(selected) = self.completion.selected_completion() {
                        self.composer.set_buffer(selected.to_string());
                        self.completion.hide();
                    }
                }
            }
            KeyCode::Down => {
                if self.completion.is_visible() {
                    self.completion.select_next();
                }
            }
            KeyCode::Up => {
                if self.completion.is_visible() {
                    self.completion.select_prev();
                }
            }
            _ => {
                self.composer.handle_key(key);
                let buffer = self.composer.buffer();
                if buffer.starts_with('/') {
                    let completions = get_command_completions(buffer);
                    self.completion.set_completions(completions);
                } else {
                    self.completion.hide();
                }
            }
        }
    }

    fn submit_input(&mut self) {
        let text = self.composer.submit();
        if text.is_empty() {
            return;
        }

        if text.starts_with('/') {
            self.execute_command(&text);
            return;
        }

        if text.to_lowercase().starts_with("remember that") {
            let fact = text
                .trim_start_matches("Remember that")
                .trim_start_matches("remember that")
                .trim();
            if !fact.is_empty() {
                let ipc_client = IpcClient::new(&self.config.ipc.socket_path);
                let request = Request::new(
                    Method::MemoryAddUserFact,
                    serde_json::json!({ "fact": fact }),
                );
                let rt = tokio::runtime::Runtime::new().unwrap();
                let result = rt.block_on(ipc_client.send(request));
                let message = match result {
                    Ok(response) if response.error.is_none() => {
                        format!("Remembered: {}", fact)
                    }
                    _ => format!("Failed to remember: {}", fact),
                };
                self.chat
                    .add_message(Message::new(MessageRole::System, message));
            }
            return;
        }

        let msg = Message::new(MessageRole::User, text.clone());
        self.chat.add_message(msg);

        tracing::info!(
            "submit_input: session_busy={}, text={}",
            self.session_busy,
            text
        );

        if self.session_busy {
            tracing::info!("Adding to queue: {}", text);
            self.queue.add(text.clone());
            self.status_bar.queue_count = self.queue.count();
        } else {
            tracing::info!("Sending message immediately: {}", text);
            let _ = self.bg_tx.blocking_send(BackgroundCommand::SendMessage {
                text,
                session_id: self.session_id.clone(),
            });
            self.session_busy = true;
            self.status = AppStatus::Processing;
            self.spinner.start(SpinnerState::Processing);
            self.chat.start_streaming();
            self.status_bar.streaming = true;
        }
    }

    fn execute_command(&mut self, text: &str) {
        if let Some(cmd) = Command::parse(text) {
            match cmd {
                Command::Help => {
                    self.mode = AppMode::HelpOverlay;
                }
                Command::Clear => {
                    self.chat.clear();
                    self.chat.add_message(Message::new(
                        MessageRole::System,
                        "Chat cleared.".to_string(),
                    ));
                }
                Command::MemoryQuery(query) => {
                    if !query.is_empty() {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        let ipc_client = IpcClient::new(&self.config.ipc.socket_path);
                        let request = Request::new(
                            Method::MemoryQuery,
                            serde_json::json!({ "query": query }),
                        );

                        if let Ok(response) = rt.block_on(ipc_client.send(request)) {
                            if let Some(result) = response.result {
                                if let Some(episodes) =
                                    result.get("episodes").and_then(|e| e.as_array())
                                {
                                    self.memory.results = episodes
                                        .iter()
                                        .filter_map(|e| {
                                            e.get("content")
                                                .and_then(|c| c.as_str())
                                                .map(String::from)
                                        })
                                        .collect();
                                    self.status_bar.memory_count = self.memory.results.len();
                                    self.memory.visible = true;
                                    self.mode = AppMode::MemoryView;
                                }
                            }
                        }
                    }
                }
                Command::Remember(fact) => {
                    if !fact.is_empty() {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        let ipc_client = IpcClient::new(&self.config.ipc.socket_path);
                        let request = Request::new(
                            Method::MemoryAddUserFact,
                            serde_json::json!({ "fact": fact }),
                        );

                        let result = rt.block_on(ipc_client.send(request));
                        let message = match result {
                            Ok(response) if response.error.is_none() => {
                                format!("Remembered: {}", fact)
                            }
                            _ => format!("Failed to remember: {}", fact),
                        };

                        self.chat
                            .add_message(Message::new(MessageRole::System, message));
                    }
                }
                Command::Skill(name) => {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    let opencode_config = OpenCodeConfig {
                        url: self.config.harness.opencode.url.clone(),
                        model: self.config.harness.opencode.model.clone(),
                        ..Default::default()
                    };
                    let opencode = OpenCodeClient::new(opencode_config);

                    if let Ok(skills) = rt.block_on(opencode.list_skills()) {
                        if let Some(skill) = skills.iter().find(|s| s.name == name) {
                            let desc = skill
                                .description
                                .clone()
                                .unwrap_or_else(|| "No description".to_string());
                            self.chat.add_message(Message::new(
                                MessageRole::System,
                                format!("Skill '{}' loaded: {}", name, desc),
                            ));
                        } else {
                            self.chat.add_message(Message::new(
                                MessageRole::System,
                                format!("Skill '{}' not found", name),
                            ));
                        }
                    } else {
                        self.chat.add_message(Message::new(
                            MessageRole::System,
                            format!("Loading skill: {} (OpenCode not available)", name),
                        ));
                    }
                }
                Command::SwitchHarness(name) => {
                    self.chat.add_message(Message::new(
                        MessageRole::System,
                        format!("Switching to harness: {} (not yet implemented)", name),
                    ));
                }
                Command::Unknown(s) => {
                    self.chat.add_message(Message::new(
                        MessageRole::System,
                        format!("Unknown command: {}", s),
                    ));
                }
            }
        }
    }
}
