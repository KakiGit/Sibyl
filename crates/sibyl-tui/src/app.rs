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

use std::sync::Arc;
use crossterm::event::KeyEvent;
use sibyl_deps::{DependencyManager, SibylConfig};
use sibyl_harness::Harness;
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::config::OpenCodeConfig;
use sibyl_opencode::types::UserMessage;

use crate::input::{handle_chat_key, handle_global_key, handle_memory_key, Command, InputComposer, HandleResult, should_handle_as_input, get_command_completions};
use crate::widgets::{Spinner, SpinnerState, CompletionPopup};

pub struct App {
    mode: AppMode,
    status: AppStatus,
    chat: ChatState,
    memory: MemoryPanelState,
    input: InputState,
    status_bar: StatusBarState,
    composer: InputComposer,
    spinner: Spinner,
    completion: CompletionPopup,
    opencode: OpenCodeClient,
    ipc: IpcClient,
    session_id: Option<String>,
    deps: Arc<DependencyManager>,
    config: SibylConfig,
}

impl App {
    pub fn new(deps: Arc<DependencyManager>, config: SibylConfig) -> Self {
        let opencode_config = OpenCodeConfig {
            url: config.harness.opencode.url.clone(),
            model: config.harness.opencode.model.clone(),
            ..Default::default()
        };
        let opencode = OpenCodeClient::new(opencode_config);
        let ipc = IpcClient::new(&config.ipc.socket_path);
        
        Self {
            mode: AppMode::Chat,
            status: AppStatus::Idle,
            chat: ChatState::default(),
            memory: MemoryPanelState::default(),
            input: InputState::default(),
            status_bar: StatusBarState {
                model: config.harness.opencode.model.clone(),
                ..Default::default()
            },
            composer: InputComposer::new(),
            spinner: Spinner::new(),
            completion: CompletionPopup::new(),
            opencode,
            ipc,
            session_id: None,
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
        if self.status == AppStatus::Processing {
            return;
        }

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

        let msg = Message::new(MessageRole::User, text.clone());
        self.chat.add_message(msg);
        self.status = AppStatus::Processing;
        self.spinner.start(SpinnerState::Processing);

        let rt = tokio::runtime::Runtime::new().unwrap();
        
        let session_id = self.session_id.clone();
        let ipc_socket = self.config.ipc.socket_path.clone();
        let ipc_client = IpcClient::new(&ipc_socket);
        let opencode_url = self.config.harness.opencode.url.clone();
        let opencode_model = self.config.harness.opencode.model.clone();
        let opencode_config = OpenCodeConfig {
            url: opencode_url,
            model: opencode_model,
            ..Default::default()
        };
        let opencode_client = OpenCodeClient::new(opencode_config);
        
        let result: (Option<String>, Option<serde_json::Value>, Option<String>) = rt.block_on(async {
            let sid = match session_id {
                Some(id) => id,
                None => {
                    let cwd = std::env::current_dir().ok();
                    match opencode_client.create_session(cwd.as_deref()).await {
                        Ok(info) => info.id,
                        Err(_) => return (None, None, None),
                    }
                }
            };
            
            let query_request = Request::new(Method::MemoryQuery, serde_json::json!({ 
                "query": text,
                "session_id": sid,
                "num_results": 10
            }));
            let memories_result: Option<serde_json::Value> = ipc_client.send(query_request).await.ok().and_then(|r| r.result);
            
            let build_request = Request::new(Method::PromptBuild, serde_json::json!({
                "session_id": sid,
                "project_path": std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string()),
                "user_query": text,
                "conversation_history": [],
                "memories": {
                    "episodes": memories_result.as_ref().and_then(|r| r.get("episodes")).cloned().unwrap_or(serde_json::json!([])),
                    "entities": memories_result.as_ref().and_then(|r| r.get("entities")).cloned().unwrap_or(serde_json::json!([])),
                    "facts": memories_result.as_ref().and_then(|r| r.get("facts")).cloned().unwrap_or(serde_json::json!([])),
                },
                "tools": ["bash", "read", "write", "edit", "glob", "grep"],
                "harness_name": "opencode",
                "max_tokens": 4000
            }));
            let built_prompt = ipc_client.send(build_request).await
                .ok()
                .and_then(|r| r.result)
                .and_then(|result| result.get("prompt").and_then(|p| p.as_str()).map(String::from))
                .unwrap_or_default();
            
            let user_msg = UserMessage::with_context(&text, &built_prompt);
            let _ = opencode_client.send_user_message(&sid, &user_msg).await;
            
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            let msgs: Option<Vec<serde_json::Value>> = opencode_client.get_messages_raw(&sid).await.ok();
            let content: Option<String> = msgs.as_ref()
                .and_then(|m: &Vec<serde_json::Value>| m.last())
                .and_then(|m: &serde_json::Value| m.get("parts"))
                .and_then(|p: &serde_json::Value| p.as_array())
                .and_then(|parts: &Vec<serde_json::Value>| parts.iter().find(|p| p.get("type").and_then(|t| t.as_str()) == Some("text")))
                .and_then(|p: &serde_json::Value| p.get("text").and_then(|t| t.as_str()).map(String::from));
            
            let full_conversation = format!("User: {}\nAssistant: {}", text, content.as_deref().unwrap_or(""));
            let add_request = Request::new(Method::MemoryAddEpisode, serde_json::json!({
                "name": "conversation",
                "content": full_conversation,
                "source_description": "user conversation",
                "session_id": sid
            }));
            let _ = ipc_client.send(add_request).await;
            
            (Some(sid), memories_result, content)
        });
        
        let (new_session_id, mem_result, assistant_content) = result;

        if let Some(sid) = new_session_id {
            self.session_id = Some(sid.clone());
            self.status_bar.session_id = Some(sid);
        }

        if let Some(mem_result) = mem_result {
            if let Some(episodes) = mem_result.get("episodes").and_then(|e| e.as_array()) {
                self.memory.results = episodes
                    .iter()
                    .filter_map(|e| e.get("content").and_then(|c| c.as_str()).map(String::from))
                    .collect();
                self.status_bar.memory_count = self.memory.results.len();
            }
        }

        let content = assistant_content.unwrap_or_else(|| {
            if self.session_id.is_some() {
                "Message sent to OpenCode. Waiting for response..."
            } else {
                "OpenCode not available. Memory system connected."
            }.to_string()
        });
        
        let assistant_msg = Message::new(MessageRole::Assistant, content)
            .with_memories(self.memory.results.clone());
        self.chat.add_message(assistant_msg);

        self.status = AppStatus::Idle;
        self.spinner.stop();
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
                        self.status = AppStatus::Processing;
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
                        self.status = AppStatus::Idle;
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
                            let desc = skill.description.clone().unwrap_or_else(|| "No description".to_string());
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
