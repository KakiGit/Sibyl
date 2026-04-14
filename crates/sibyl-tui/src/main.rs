mod theme;

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
    style::Modifier,
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame, Terminal,
};
use sibyl_core::{Orchestrator, Session};
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};

use theme::*;

struct App {
    orchestrator: Arc<Orchestrator>,
    sessions: Vec<Session>,
    current_session: Option<usize>,
    input: String,
    messages: Vec<MessageEntry>,
    status: AppStatus,
    show_memory_panel: bool,
    memory_results: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AppStatus {
    Idle,
    Processing,
    Error,
}

struct MessageEntry {
    role: MessageRole,
    content: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MessageRole {
    User,
    Assistant,
    System,
}

impl App {
    fn new(orchestrator: Arc<Orchestrator>) -> Self {
        Self {
            orchestrator,
            sessions: Vec::new(),
            current_session: None,
            input: String::new(),
            messages: Vec::new(),
            status: AppStatus::Idle,
            show_memory_panel: false,
            memory_results: Vec::new(),
        }
    }

    fn create_session(&mut self) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let session = rt.block_on(self.orchestrator.create_session(None)).ok();
        if let Some(session) = session {
            self.sessions.push(session);
            self.current_session = Some(self.sessions.len() - 1);
            self.messages.push(MessageEntry {
                role: MessageRole::System,
                content: "Session created. Ready for input.".to_string(),
                timestamp: chrono::Utc::now(),
            });
        }
    }

    fn send_message(&mut self) {
        if self.input.trim().is_empty() || self.current_session.is_none() {
            return;
        }

        let user_msg = MessageEntry {
            role: MessageRole::User,
            content: self.input.clone(),
            timestamp: chrono::Utc::now(),
        };
        self.messages.push(user_msg);
        self.status = AppStatus::Processing;
        let input = self.input.clone();
        self.input.clear();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let ipc_client = IpcClient::new("/tmp/sibyl-ipc.sock");
        let request = Request::new(Method::MemoryQuery, serde_json::json!({ "query": input }));

        if let Ok(response) = rt.block_on(ipc_client.send(request)) {
            if let Some(result) = response.result {
                if let Some(episodes) = result.get("episodes").and_then(|e| e.as_array()) {
                    self.memory_results = episodes
                        .iter()
                        .filter_map(|e| e.get("content").and_then(|c| c.as_str()).map(String::from))
                        .collect();
                }
            }
        }

        let assistant_msg = MessageEntry {
            role: MessageRole::Assistant,
            content: "Processing your request...".to_string(),
            timestamp: chrono::Utc::now(),
        };
        self.messages.push(assistant_msg);
        self.status = AppStatus::Idle;
    }

    fn handle_key_event(&mut self, key: KeyEvent) -> bool {
        match key.code {
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                return false;
            }
            KeyCode::Char('m') if key.modifiers.contains(KeyModifiers::ALT) => {
                self.show_memory_panel = !self.show_memory_panel;
            }
            KeyCode::Enter => {
                if self.status == AppStatus::Idle {
                    self.send_message();
                }
            }
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(c) => {
                if self.status == AppStatus::Idle {
                    self.input.push(c);
                }
            }
            KeyCode::Esc => {
                self.show_memory_panel = false;
            }
            _ => {}
        }
        true
    }
}

fn ui(f: &mut Frame, app: &App) {
    let chunks = if app.show_memory_panel {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(70), Constraint::Percentage(30)])
            .split(f.area())
    } else {
        Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(1)])
            .split(f.area())
    };

    let main_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),
            Constraint::Length(3),
            Constraint::Length(1),
        ])
        .split(chunks[0]);

    render_messages(f, app, main_chunks[0]);
    render_input(f, app, main_chunks[1]);
    render_status_bar(f, app, main_chunks[2]);

    if app.show_memory_panel {
        render_memory_panel(f, app, chunks[1]);
    }
}

fn render_messages(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app
        .messages
        .iter()
        .map(|msg| {
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
            ListItem::new(Line::from(vec![
                Span::styled(prefix, style.add_modifier(Modifier::BOLD)),
                Span::styled(&msg.content, style),
            ]))
        })
        .collect();

    let messages = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Chat")
            .style(border()),
    );
    f.render_widget(messages, area);
}

fn render_input(f: &mut Frame, app: &App, area: Rect) {
    let style = if app.status == AppStatus::Processing {
        muted()
    } else {
        default()
    };

    let input = Paragraph::new(app.input.as_str()).style(style).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Input")
            .style(border()),
    );
    f.render_widget(input, area);
}

fn render_status_bar(f: &mut Frame, app: &App, area: Rect) {
    let status_text = match app.status {
        AppStatus::Idle => "Ready",
        AppStatus::Processing => "Processing...",
        AppStatus::Error => "Error",
    };

    let status_style = match app.status {
        AppStatus::Idle => success(),
        AppStatus::Processing => warning(),
        AppStatus::Error => error(),
    };

    let session_info = if let Some(idx) = app.current_session {
        format!("Session {} | ", idx + 1)
    } else {
        "No session | ".to_string()
    };

    let status = Paragraph::new(Line::from(vec![
        Span::styled(&session_info, muted()),
        Span::styled(status_text, status_style),
        Span::styled(" | Alt+M: Memory | Ctrl+C: Quit", muted()),
    ]))
    .style(default());
    f.render_widget(status, area);
}

fn render_memory_panel(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app
        .memory_results
        .iter()
        .map(|mem| ListItem::new(Line::from(Span::styled(mem, memory_highlight()))))
        .collect();

    let memory = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Memory")
            .style(border()),
    );
    f.render_widget(memory, area);
}

fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    mut app: App,
) -> io::Result<()> {
    loop {
        terminal.draw(|f| ui(f, &app))?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if !app.handle_key_event(key) {
                    return Ok(());
                }
            }
        }
    }
}

pub fn main() -> anyhow::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let orchestrator = Arc::new(Orchestrator::new(Arc::new(
        sibyl_opencode::OpenCodeClient::new("http://localhost:8080"),
    )));
    let mut app = App::new(orchestrator);
    app.create_session();

    run_app(&mut terminal, app)?;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    Ok(())
}
