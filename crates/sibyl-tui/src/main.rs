mod app;
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

use app::{App, AppMode, AppStatus};
use render::{render_chat, render_command_input, render_input, render_memory_panel, render_status_bar};
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

    let main_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(1),
            Constraint::Length(3),
        ])
        .split(chunks[0]);

    let mode_text = match app.mode() {
        AppMode::Chat => "CHAT",
        AppMode::MemoryView => "MEMORY",
        AppMode::CommandPalette => "COMMAND",
        AppMode::HelpOverlay => "HELP",
    };
    render_status_bar(f, main_chunks[0], app.status(), app.status_bar(), mode_text);

    render_chat(f, app.chat(), main_chunks[1], app.status() == AppStatus::Processing);

    if app.mode() == AppMode::CommandPalette {
        render_command_input(f, &app.input_state(), main_chunks[2]);
    } else {
        render_input(
            f,
            &app.input_state(),
            main_chunks[2],
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
) -> io::Result<()> {
    loop {
        {
            let rt = tokio::runtime::Runtime::new().unwrap();
            let dep_status = rt.block_on(async {
                app.deps().get_status_summary().await
            });
            app.set_dep_status(dep_status);
        }

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
    let deps = Arc::new(DependencyManager::new(config.dependencies.clone()));
    
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let app = App::new(deps.clone(), config);
    
    terminal.draw(|f| ui(f, &app))?;

    tracing::info!("Starting Sibyl - ensuring dependencies are running");
    
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        if let Err(e) = deps.ensure_all().await {
            tracing::error!("Failed to start critical dependency: {}", e);
        }
    });

    let result = run_app(&mut terminal, app);

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