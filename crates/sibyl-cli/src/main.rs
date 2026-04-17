use std::io;
use std::sync::Arc;

use clap::{Parser, Subcommand};
use sibyl_deps::DependencyManager;
use sibyl_tui::session::{SessionRunner, format_headless_output};

#[derive(Parser)]
#[command(name = "sibyl")]
#[command(author = "Sibyl Contributors")]
#[command(version = "0.1.0")]
#[command(about = "Memory-enhanced AI coding assistant")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Run a one-shot query in headless mode")]
    Run {
        #[arg(short, long, help = "Prompt to send to the assistant")]
        prompt: Option<String>,
        
        #[arg(short, long, help = "Read prompt from stdin")]
        stdin: bool,
        
        #[arg(short, long, help = "Output in JSON format")]
        json: bool,
    },
    
    #[command(about = "Launch the terminal user interface")]
    Tui,
    
    #[command(about = "Query memory system")]
    Memory {
        #[arg(short, long, help = "Query text")]
        query: String,
        
        #[arg(short, long, help = "Output in JSON format")]
        json: bool,
    },
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();

    match cli.command {
        None => run_tui(),
        Some(Commands::Tui) => run_tui(),
        Some(Commands::Run { prompt, stdin, json }) => run_headless(prompt, stdin, json),
        Some(Commands::Memory { query, json }) => run_memory_query(query, json),
    }
}

fn run_tui() -> anyhow::Result<()> {
    use crossterm::{
        event::{self, Event},
        execute,
        terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
    };
    use ratatui::{
        backend::CrosstermBackend,
        layout::{Constraint, Direction, Layout},
        Terminal,
    };
    use std::time::Duration;
    
    use sibyl_tui::{
        App, AppMode, AppStatus,
        render_chat, render_input, render_memory_panel, render_status_bar,
        render_command_input, render_help_overlay, render_queue_panel,
        create_channels, spawn_background_task_with_events,
    };
    use sibyl_deps::load_config;
    use sibyl_opencode::client::OpenCodeClient;
    use sibyl_opencode::config::OpenCodeConfig;
    use sibyl_ipc::client::IpcClient;

    let config = load_config();
    let deps = Arc::new(DependencyManager::new(config.dependencies.clone()));
    
    tracing::info!("Starting Sibyl TUI - ensuring dependencies are running");
    
    let rt = tokio::runtime::Runtime::new()?;
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
    
    rt.spawn(async move {
        spawn_background_task_with_events(opencode, ipc, bg_rx, ui_tx).await
    });

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(deps.clone(), config, bg_tx, ui_rx);

    let result: io::Result<()> = loop {
        {
            let dep_status = rt.block_on(async {
                app.deps().get_status_summary().await
            });
            app.set_dep_status(dep_status);
        }

        app.process_events();

        terminal.draw(|f| {
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

            let spinner_char = app.spinner_char();
            render_chat(f, app.chat(), main_chunks[1], app.status() == AppStatus::Processing, spinner_char);

            if queue_height > 0 {
                render_queue_panel(f, app.queue(), main_chunks[2]);
            }

            let input_index = if queue_height > 0 { 3 } else { 2 };

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
        })?;

        app.tick_spinner();

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if !app.handle_key(key) {
                    break Ok(());
                }
            }
        }
    };

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

fn run_headless(prompt: Option<String>, use_stdin: bool, json_output: bool) -> anyhow::Result<()> {
    use sibyl_deps::load_config;
    let config = load_config();
    let deps = Arc::new(DependencyManager::new(config.dependencies.clone()));
    
    let rt = tokio::runtime::Runtime::new()?;
    
    rt.block_on(async {
        if let Err(e) = deps.ensure_all().await {
            tracing::warn!("Some dependencies failed to start: {}", e);
        }
    });

    let prompt_text = if use_stdin {
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        input.trim().to_string()
    } else if let Some(p) = prompt {
        p
    } else {
        eprintln!("Error: No prompt provided. Use --prompt or --stdin");
        std::process::exit(1);
    };

    if prompt_text.is_empty() {
        eprintln!("Error: Empty prompt");
        std::process::exit(1);
    }

    let mut runner = SessionRunner::new(deps.clone(), config);
    
    let result = rt.block_on(async {
        runner.run(&prompt_text).await
    });

    match result {
        Ok(session_result) => {
            if json_output {
                let json = serde_json::json!({
                    "input": prompt_text,
                    "memories": session_result.memories,
                    "response": session_result.response,
                    "session_id": session_result.session_id
                });
                println!("{}", serde_json::to_string_pretty(&json)?);
            } else {
                println!("{}", format_headless_output(&session_result, &prompt_text));
            }
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }

    rt.block_on(async {
        if let Err(e) = deps.shutdown().await {
            tracing::warn!("Error during shutdown: {}", e);
        }
    });

    Ok(())
}

fn run_memory_query(query: String, json_output: bool) -> anyhow::Result<()> {
    use sibyl_ipc::client::IpcClient;
    use sibyl_ipc::{Method, Request};
    use sibyl_deps::load_config;
    
    let config = load_config();
    let deps = Arc::new(DependencyManager::new(config.dependencies));
    let rt = tokio::runtime::Runtime::new()?;
    
    rt.block_on(async {
        if let Err(e) = deps.ensure_all().await {
            tracing::warn!("Some dependencies failed to start: {}", e);
        }
    });

    let ipc = IpcClient::new("/tmp/sibyl-ipc.sock");
    
    let request = Request::new(Method::MemoryQuery, serde_json::json!({ "query": query }));
    
    let result = rt.block_on(async {
        ipc.send(request).await
    });

    match result {
        Ok(response) => {
            if let Some(result) = response.result {
                if json_output {
                    println!("{}", serde_json::to_string_pretty(&result)?);
                } else {
                    println!("Memory Query Results:");
                    println!("───────────────────────");
                    if let Some(episodes) = result.get("episodes").and_then(|e| e.as_array()) {
                        for (i, episode) in episodes.iter().enumerate() {
                            if let Some(content) = episode.get("content").and_then(|c| c.as_str()) {
                                println!("{}. {}", i + 1, content);
                            }
                        }
                        if episodes.is_empty() {
                            println!("No memories found.");
                        }
                    } else {
                        println!("No results returned.");
                    }
                }
            } else {
                if json_output {
                    println!("{}", serde_json::json!({ "error": "No response from memory system" }));
                } else {
                    println!("No response from memory system.");
                }
            }
        }
        Err(e) => {
            if json_output {
                println!("{}", serde_json::json!({ "error": e.to_string() }));
            } else {
                eprintln!("Error querying memory: {}", e);
            }
            std::process::exit(1);
        }
    }

    rt.block_on(async {
        if let Err(e) = deps.shutdown().await {
            tracing::warn!("Error during shutdown: {}", e);
        }
    });

    Ok(())
}