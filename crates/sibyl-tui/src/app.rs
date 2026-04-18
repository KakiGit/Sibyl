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
    pub memories_injected: Vec<String>,
}

impl Message {
    pub fn new(role: MessageRole, content: String) -> Self {
        Self {
            role,
            content,
            memories_injected: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChatState {
    pub messages: Vec<Message>,
    pub scroll_offset: usize,
    pub streaming: bool,
    pub current_response: Option<String>,
    pub auto_scroll: bool,
}

impl Default for ChatState {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            scroll_offset: 0,
            streaming: false,
            current_response: None,
            auto_scroll: true,
        }
    }
}

impl ChatState {
    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
        self.auto_scroll = true;
    }

    pub fn clear(&mut self) {
        self.messages.clear();
        self.scroll_offset = 0;
        self.current_response = None;
        self.auto_scroll = true;
    }

    pub fn scroll_up(&mut self, amount: usize) {
        self.scroll_offset = self.scroll_offset.saturating_sub(amount);
        self.auto_scroll = false;
    }

    pub fn scroll_down(&mut self, amount: usize) {
        self.scroll_offset = self.scroll_offset.saturating_add(amount);
    }

    pub fn scroll_to_bottom(&mut self) {
        self.auto_scroll = true;
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

#[derive(Debug, Clone, Default)]
pub struct MemoryPanelState {
    pub visible: bool,
    pub results: Vec<String>,
    pub scroll_offset: usize,
}

#[derive(Debug, Clone, Default)]
pub struct QueuePanelState {
    pub messages: Vec<String>,
    pub selected_index: Option<usize>,
}

impl QueuePanelState {
    pub fn add(&mut self, text: String) {
        self.messages.push(text);
    }

    pub fn is_empty(&self) -> bool {
        self.messages.is_empty()
    }

    pub fn count(&self) -> usize {
        self.messages.len()
    }
}

#[derive(Debug, Clone, Default)]
pub struct InputState {
    pub buffer: String,
    pub cursor_position: usize,
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
use std::time::{Duration, Instant};

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
    last_esc_time: Option<Instant>,
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
            last_esc_time: None,
        }
    }

    pub fn load_history(&mut self) {
        self.composer.load_history();
    }

    pub fn save_history(&self) {
        self.composer.save_history();
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
            UiEvent::SessionCreated { session_id } => {
                tracing::info!("UI: SessionCreated {}", session_id);
                self.session_id = Some(session_id.clone());
                self.status_bar.session_id = Some(session_id);
            }
            UiEvent::SessionCanceled { session_id } => {
                tracing::info!("UI: SessionCanceled {}", session_id);
                self.session_busy = false;
                self.status = AppStatus::Idle;
                self.spinner.stop();
                self.chat.streaming = false;
                self.chat.current_response = None;
                self.status_bar.streaming = false;
                self.queue.messages.clear();
                self.status_bar.queue_count = 0;
                self.chat.add_message(Message::new(MessageRole::System, "Session canceled.".to_string()));
            }
            UiEvent::SessionIdle { session_id } => {
                tracing::info!("UI: SessionIdle {}", session_id);
                self.session_busy = false;
                self.session_id = Some(session_id.clone());
                self.status_bar.session_id = Some(session_id.clone());
                self.status_bar.streaming = false;
                self.status = AppStatus::Idle;
                self.spinner.stop();

                if self.chat.streaming {
                    let content = self.chat.current_response.clone().unwrap_or_default();
                    if !content.is_empty() {
                        tracing::info!("SessionIdle: finishing stream with content");
                        self.chat.finish_stream(content);
                    } else {
                        tracing::info!(
                            "SessionIdle: stream still empty, waiting for MessagePartComplete"
                        );
                    }
                }
                self.chat.streaming = false;
                self.chat.current_response = None;

                tracing::info!("Session idle, queue count: {}", self.queue.count());
                if !self.queue.messages.is_empty() {
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
                tracing::info!("UI: SessionBusy {}", session_id);
                self.session_busy = true;
                self.session_id = Some(session_id.clone());
                self.status_bar.session_id = Some(session_id);
                self.status = AppStatus::Processing;
                self.spinner.start(SpinnerState::Processing);
                if !self.chat.streaming {
                    self.chat.start_streaming();
                    self.status_bar.streaming = true;
                }
            }
            UiEvent::MessageCreated {
                session_id,
                message_id,
                role,
            } => {
                tracing::info!(
                    "UI: MessageCreated session={} msg={} role={}",
                    session_id,
                    message_id,
                    role
                );
            }
            UiEvent::MessagePartDelta {
                session_id,
                message_id,
                part_id,
                delta,
            } => {
                tracing::debug!(
                    "UI: MessagePartDelta session={} msg={} part={} delta={}",
                    session_id,
                    message_id,
                    part_id,
                    delta
                );
                self.chat.append_stream(&delta);
            }
            UiEvent::MessagePartComplete {
                session_id,
                message_id,
                part_id,
                content,
            } => {
                tracing::info!(
                    "UI: MessagePartComplete session={} msg={} part={} content={}",
                    session_id,
                    message_id,
                    part_id,
                    content
                );
                self.chat.finish_stream(content);
            }
            UiEvent::MessageComplete {
                session_id,
                message_id,
            } => {
                tracing::info!(
                    "UI: MessageComplete session={} msg={}",
                    session_id,
                    message_id
                );
                self.chat.streaming = false;
                self.status_bar.streaming = false;
            }
            UiEvent::ToolUse {
                session_id,
                tool,
                status,
            } => {
                tracing::info!(
                    "UI: ToolUse session={} tool={} status={}",
                    session_id,
                    tool,
                    status
                );
                if status == "completed" {
                    let msg =
                        Message::new(MessageRole::System, format!("Tool '{}' completed", tool));
                    self.chat.add_message(msg);
                } else if status == "error" {
                    let msg = Message::new(MessageRole::System, format!("Tool '{}' failed", tool));
                    self.chat.add_message(msg);
                }
            }
            UiEvent::Error {
                session_id,
                message,
            } => {
                tracing::error!("UI: Error session={} message={}", session_id, message);
                let msg = Message::new(MessageRole::System, format!("Error: {}", message));
                self.chat.add_message(msg);
                self.status = AppStatus::Error;
            }
            UiEvent::MemoriesRetrieved { memories } => {
                tracing::info!("UI: MemoriesRetrieved count={}", memories.len());
                self.memory.results = memories;
                self.status_bar.memory_count = self.memory.results.len();
            }
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
            HandleResult::CancelSession => {
                if self.session_busy {
                    self.cancel_session();
                } else {
                    return false;
                }
                return true;
            }
            HandleResult::DoubleEsc => {
                let now = Instant::now();
                if let Some(last_esc) = self.last_esc_time {
                    if now.duration_since(last_esc) < Duration::from_millis(500) {
                        if self.session_busy {
                            self.cancel_session();
                        } else {
                            return false;
                        }
                        self.last_esc_time = None;
                        return true;
                    }
                }
                self.last_esc_time = Some(now);
                return true;
            }
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
                self.chat.scroll_down(n);
            }
            HandleResult::ScrollUp(n) => {
                self.chat.scroll_up(n);
            }
            HandleResult::ScrollToBottom => {
                self.chat.scroll_to_bottom();
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
                let result = ipc_client.send_blocking(request);
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

    fn cancel_session(&mut self) {
        if let Some(session_id) = self.session_id.clone() {
            tracing::info!("Requesting session cancel: {}", session_id);
            let _ = self.bg_tx.blocking_send(BackgroundCommand::CancelSession { session_id });
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
                        let ipc_client = IpcClient::new(&self.config.ipc.socket_path);
                        let request = Request::new(
                            Method::MemoryQuery,
                            serde_json::json!({ "query": query }),
                        );

                        if let Ok(response) = ipc_client.send_blocking(request) {
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
                        let ipc_client = IpcClient::new(&self.config.ipc.socket_path);
                        let request = Request::new(
                            Method::MemoryAddUserFact,
                            serde_json::json!({ "fact": fact }),
                        );

                        let result = ipc_client.send_blocking(request);
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
