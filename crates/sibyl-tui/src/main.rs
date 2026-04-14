mod app;
mod input;
mod render;
mod theme;
mod widgets;

use std::io;
use std::sync::Arc;
use std::time::Duration;

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    Frame, Terminal,
};
use sibyl_core::Orchestrator;
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};

use app::{AppMode, AppStatus, ChatState, InputState, Message, MessageRole, MemoryPanelState, StatusBarState};
use input::{handle_chat_key, handle_global_key, handle_memory_key, Command, InputComposer};
use render::{
    render_chat, render_command_input, render_input, render_memory_panel, render_status_bar,
};
use widgets::{render_help_overlay, Spinner, SpinnerState};

struct App {
    mode: AppMode,
    status: AppStatus,
    chat: ChatState,
    memory: MemoryPanelState,
    input: InputState,
    status_bar: StatusBarState,
    composer: InputComposer,
    spinner: Spinner,
}

impl App {
    fn new() -> Self {
        Self {
            mode: AppMode::Chat,
            status: AppStatus::Idle,
            chat: ChatState::default(),
            memory: MemoryPanelState::default(),
            input: InputState::default(),
            status_bar: StatusBarState::default(),
            composer: InputComposer::new(),
            spinner: Spinner::new(),
        }
    }

    fn handle_key(&mut self, key: KeyEvent) -> bool {
        if self.mode == AppMode::HelpOverlay {
            self.mode = AppMode::Chat;
            return true;
        }

        let global_result = handle_global_key(key, self.mode);
        match global_result {
            input::HandleResult::Quit => return false,
            input::HandleResult::SwitchMode(mode) => {
                self.mode = mode;
                return true;
            }
            input::HandleResult::ToggleMemoryPanel => {
                self.memory.visible = !self.memory.visible;
                if self.memory.visible {
                    self.mode = AppMode::MemoryView;
                } else {
                    self.mode = AppMode::Chat;
                }
                return true;
            }
            input::HandleResult::ShowHelp => {
                self.mode = AppMode::HelpOverlay;
                return true;
            }
            input::HandleResult::HideHelp => {
                self.mode = AppMode::Chat;
                return true;
            }
            input::HandleResult::ClearChat => {
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
            input::HandleResult::ScrollDown(n) => {
                let total: usize = self.chat.messages.iter().map(|m| m.content.lines().count()).sum();
                let visible = 20;
                self.chat.scroll_down(n, total, visible);
            }
            input::HandleResult::ScrollUp(n) => {
                self.chat.scroll_up(n);
            }
            input::HandleResult::SubmitInput => {
                self.submit_input();
            }
            input::HandleResult::SwitchMode(mode) => {
                self.mode = mode;
            }
            _ => {
                if input::should_handle_as_input(key, self.mode) {
                    self.composer.handle_key(key);
                }
            }
        }
    }

    fn handle_memory_mode(&mut self, key: KeyEvent) {
        let result = handle_memory_key(key);
        match result {
            input::HandleResult::ScrollDown(n) => {
                self.memory.scroll_offset = self.memory.scroll_offset.saturating_add(n);
            }
            input::HandleResult::ScrollUp(n) => {
                self.memory.scroll_offset = self.memory.scroll_offset.saturating_sub(n);
            }
            input::HandleResult::ToggleMemoryPanel => {
                self.memory.visible = false;
                self.mode = AppMode::Chat;
            }
            input::HandleResult::SwitchMode(mode) => {
                self.mode = mode;
            }
            _ => {
                if input::should_handle_as_input(key, self.mode) {
                    self.composer.handle_key(key);
                }
            }
        }
    }

    fn handle_command_mode(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.mode = AppMode::Chat;
                self.composer.clear();
            }
            KeyCode::Enter => {
                let cmd_text = self.composer.submit();
                self.execute_command(&cmd_text);
                self.mode = AppMode::Chat;
            }
            _ => {
                self.composer.handle_key(key);
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
        let ipc_client = IpcClient::new("/tmp/sibyl-ipc.sock");
        let request = Request::new(Method::MemoryQuery, serde_json::json!({ "query": text }));

        if let Ok(response) = rt.block_on(ipc_client.send(request)) {
            if let Some(result) = response.result {
                if let Some(episodes) = result.get("episodes").and_then(|e| e.as_array()) {
                    self.memory.results = episodes
                        .iter()
                        .filter_map(|e| e.get("content").and_then(|c| c.as_str()).map(String::from))
                        .collect();
                    self.status_bar.memory_count = self.memory.results.len();
                }
            }
        }

        let assistant_msg = Message::new(MessageRole::Assistant, "Processing your request...".to_string())
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
                        let ipc_client = IpcClient::new("/tmp/sibyl-ipc.sock");
                        let request = Request::new(Method::MemoryQuery, serde_json::json!({ "query": query }));
                        
                        if let Ok(response) = rt.block_on(ipc_client.send(request)) {
                            if let Some(result) = response.result {
                                if let Some(episodes) = result.get("episodes").and_then(|e| e.as_array()) {
                                    self.memory.results = episodes
                                        .iter()
                                        .filter_map(|e| e.get("content").and_then(|c| c.as_str()).map(String::from))
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
                    self.chat.add_message(Message::new(
                        MessageRole::System,
                        format!("Loading skill: {} (not yet implemented)", name),
                    ));
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

fn ui(f: &mut Frame, app: &App) {
    let chunks = if app.memory.visible {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(70), Constraint::Percentage(30)])
            .split(f.area())
    } else {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(100)])
            .split(f.area())
    };

    let main_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(1),
            Constraint::Length(3),
        ])
        .split(chunks[0]);

    let mode_text = match app.mode {
        AppMode::Chat => "CHAT",
        AppMode::MemoryView => "MEMORY",
        AppMode::CommandPalette => "COMMAND",
        AppMode::HelpOverlay => "HELP",
    };
    render_status_bar(f, main_chunks[0], app.status, &app.status_bar, mode_text);

    render_chat(f, &app.chat, main_chunks[1]);

    if app.mode == AppMode::CommandPalette {
        let mut cmd_input = InputState::default();
        cmd_input.buffer = app.composer.buffer().to_string();
        cmd_input.cursor_position = app.composer.cursor();
        render_command_input(f, &cmd_input, main_chunks[2]);
    } else {
        let mut input_state = InputState::default();
        input_state.buffer = app.composer.buffer().to_string();
        input_state.cursor_position = app.composer.cursor();
        let focused = app.mode == AppMode::Chat;
        render_input(f, &input_state, main_chunks[2], focused, app.status == AppStatus::Processing);
    }

    if app.memory.visible {
        render_memory_panel(f, &app.memory, chunks[1]);
    }

    if app.mode == AppMode::HelpOverlay {
        render_help_overlay(f, f.area());
    }
}

fn run_app<B: ratatui::backend::Backend>(terminal: &mut Terminal<B>, mut app: App) -> io::Result<()> {
    loop {
        terminal.draw(|f| ui(f, &app))?;

        app.spinner.tick();

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if !app.handle_key(key) {
                    return Ok(());
                }
            }
        }
    }
}

fn main() -> anyhow::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let app = App::new();

    let result = run_app(&mut terminal, app);

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result?;
    Ok(())
}