mod app;
mod background;
mod input;
mod render;
mod theme;
mod widgets;

use std::io;
use std::sync::Arc;
use std::time::Duration;

use crossterm::{
    event::{self, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    Terminal, Frame,
};
use sibyl_deps::{DependencyManager, load_config};
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::config::OpenCodeConfig;
use sibyl_ipc::client::IpcClient;

use app::{App, AppMode, AppStatus};
use background::{create_channels, spawn_background_task_with_events};
use render::{render_chat, render_command_input, render_input, render_memory_panel, render_status_bar, render_queue_panel};
use widgets::render_help_overlay;

fn ui(f: &mut Frame, app: &App) {
    let chunks = if app.memory_visible() {
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

    let queue_height = if app.queue().is_empty() { 0 } else { 3 };
    
    let main_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(if queue_height > 0 {
            vec![
                Constraint::Length(1),
                Constraint::Min(1),
                Constraint::Length(queue_height),
                Constraint::Length(3),
            ]
        } else {
            vec![
                Constraint::Length(1),
                Constraint::Min(1),
                Constraint::Length(3),
            ]
        })
        .split(chunks[0]);

    let mode_text = match app.mode() {
        AppMode::Chat => "CHAT",
        AppMode::MemoryView => "MEMORY",
        AppMode::CommandPalette => "COMMAND",
        AppMode::HelpOverlay => "HELP",
    };
    render_status_bar(f, main_chunks[0], app.status(), app.status_bar(), mode_text);

    let chat_area = main_chunks[1];
    let spinner_char = app.spinner_char();
    render_chat(f, app.chat(), chat_area, app.status() == AppStatus::Processing, spinner_char);

    let input_index = if queue_height > 0 { 3 } else { 2 };
    
    if queue_height > 0 {
        render_queue_panel(f, app.queue(), main_chunks[2]);
    }

    if app.mode() == AppMode::CommandPalette {
        render_command_input(f, &app.input_state(), main_chunks[input_index]);
    } else {
        render_input(
            f,
            &app.input_state(),
            main_chunks[input_index],
            app.mode() == AppMode::Chat,
            app.status() == AppStatus::Processing,
        );
    }

    if app.memory_visible() {
        render_memory_panel(f, app.memory(), chunks[1]);
    }

    if app.mode() == AppMode::HelpOverlay {
        render_help_overlay(f, f.area());
    }
}

fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    mut app: App,
    rt: &tokio::runtime::Runtime,
) -> io::Result<()> {
    loop {
        {
            let dep_status = rt.block_on(async {
                app.deps().get_status_summary().await
            });
            app.set_dep_status(dep_status);
        }

        app.process_events();
        
        terminal.draw(|f| ui(f, &app))?;

        app.tick_spinner();

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
    tracing_subscriber::fmt::init();

    let config = load_config();
    tracing::info!("Starting Sibyl - config loaded");
    let deps = Arc::new(DependencyManager::new(config.dependencies.clone()));
    
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    tracing::info!("Starting Sibyl - ensuring dependencies are running");
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        if let Err(e) = deps.ensure_all().await {
            tracing::error!("Failed to start critical dependency: {}", e);
        }
    });

    let (bg_tx, bg_rx, ui_tx, ui_rx) = create_channels();
    
    let opencode_config = OpenCodeConfig {
        url: config.harness.opencode.url.clone(),
        model: config.harness.opencode.model.clone(),
        ..Default::default()
    };
    let opencode = OpenCodeClient::new(opencode_config);
    let ipc = IpcClient::new(&config.ipc.socket_path);
    
    tracing::info!("Spawning background task with SSE events");
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let bg_handle = {
        let _guard = rt.enter();
        spawn_background_task_with_events(opencode, ipc, bg_rx, ui_tx, ready_tx)
    };
    
    tracing::info!("Waiting for SSE connection...");
    match rt.block_on(ready_rx) {
        Ok(true) => tracing::info!("SSE connected successfully"),
        Ok(false) => tracing::warn!("SSE connection failed, continuing without SSE"),
        Err(_) => tracing::warn!("Background task crashed before SSE connection"),
    }
    
    tracing::info!("Background task spawned, handle: {:?}", bg_handle);
    
    let app = App::new(deps.clone(), config, bg_tx, ui_rx);
    
    terminal.draw(|f| ui(f, &app))?;

    let result = run_app(&mut terminal, app, &rt);

    tracing::info!("Shutting down Sibyl");
    rt.block_on(async {
        if let Err(e) = deps.shutdown().await {
            tracing::warn!("Error during shutdown: {}", e);
        }
    });

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result?;
    Ok(())
}