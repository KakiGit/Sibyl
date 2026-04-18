use std::io;
use std::path::PathBuf;
use std::sync::Arc;

use clap::{Parser, Subcommand};
use sibyl_deps::DependencyManager;
use sibyl_tui::session::{format_headless_output, SessionRunner};

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
    Tui {
        #[arg(short, long, help = "Write debug logs to /tmp/sibyl.log")]
        log: bool,

        #[arg(long, help = "Write debug logs to specified file")]
        log_file: Option<PathBuf>,
    },

    #[command(about = "Memory system operations")]
    Memory {
        #[command(subcommand)]
        memory_cmd: MemoryCommands,
    },
}

#[derive(Subcommand)]
enum MemoryCommands {
    #[command(about = "Query memory system")]
    Query {
        #[arg(short, long, help = "Query text")]
        query: String,

        #[arg(short, long, help = "Output in JSON format")]
        json: bool,
    },

    #[command(about = "List all memories")]
    List {
        #[arg(short, long, help = "Session ID to filter")]
        session: Option<String>,

        #[arg(short, long, help = "Limit number of results")]
        limit: Option<usize>,

        #[arg(short, long, help = "Output in JSON format")]
        json: bool,
    },

    #[command(about = "Modify a memory")]
    Modify {
        #[arg(help = "Episode ID to modify")]
        id: String,

        #[arg(short, long, help = "New content")]
        content: Option<String>,

        #[arg(short, long, help = "New source")]
        source: Option<String>,

        #[arg(short, long, help = "Output in JSON format")]
        json: bool,
    },

    #[command(about = "Delete a memory")]
    Delete {
        #[arg(help = "Episode ID to delete")]
        id: String,

        #[arg(short, long, help = "Output in JSON format")]
        json: bool,
    },
}

fn setup_logging(log_path: Option<PathBuf>) -> anyhow::Result<()> {
    if let Some(path) = log_path {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        let (non_blocking, _guard) = tracing_appender::non_blocking::NonBlocking::new(file);
        tracing_subscriber::fmt()
            .with_writer(non_blocking)
            .with_max_level(tracing::Level::DEBUG)
            .with_ansi(false)
            .init();
        tracing::info!("Logging to {}", path.display());
    } else {
        tracing_subscriber::fmt::init();
    }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        None => run_tui(None),
        Some(Commands::Tui { log, log_file }) => {
            let path = log_file.or_else(|| {
                if log {
                    Some(PathBuf::from("/tmp/sibyl.log"))
                } else {
                    None
                }
            });
            run_tui(path)
        }
        Some(Commands::Run {
            prompt,
            stdin,
            json,
        }) => run_headless(prompt, stdin, json),
        Some(Commands::Memory { memory_cmd }) => run_memory_command(memory_cmd),
    }
}

fn run_tui(log_path: Option<PathBuf>) -> anyhow::Result<()> {
    setup_logging(log_path)?;

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

    use sibyl_deps::load_config;
    use sibyl_ipc::client::IpcClient;
    use sibyl_opencode::client::OpenCodeClient;
    use sibyl_opencode::config::OpenCodeConfig;
    use sibyl_tui::{
        create_channels, render_chat, render_command_input, render_help_overlay, render_input,
        render_memory_panel, render_queue_panel, render_status_bar,
        spawn_background_task, App, AppMode, AppStatus,
    };

    let config = load_config();
    tracing::info!("Starting Sibyl TUI - config loaded");
    tracing::info!(
        "OpenCode URL: {}, Model: {}",
        config.harness.opencode.url,
        config.harness.opencode.model
    );
    tracing::info!("IPC socket: {}", config.ipc.socket_path);
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

    {
        let _guard = rt.enter();
        spawn_background_task(opencode, ipc, bg_rx, ui_tx);
    }

    let _ = bg_tx.blocking_send(sibyl_tui::background::BackgroundCommand::LoadInitialMemories);

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(deps.clone(), config, bg_tx, ui_rx);

    let result: io::Result<()> = loop {
        {
            let dep_status = rt.block_on(async { app.deps().get_status_summary().await });
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
            render_chat(
                f,
                app.chat(),
                main_chunks[1],
                app.status() == AppStatus::Processing,
                spinner_char,
            );

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
                    app.spinner_char(),
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

    let mut runner = SessionRunner::new(
        deps.clone(),
        &config.ipc.socket_path,
        &config.harness.opencode.url,
        &config.harness.opencode.model,
    );

    let result = rt.block_on(async { runner.run(&prompt_text).await });

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

fn run_memory_command(memory_cmd: MemoryCommands) -> anyhow::Result<()> {
    use sibyl_deps::load_config;
    use sibyl_ipc::client::IpcClient;

    let config = load_config();
    let deps = Arc::new(DependencyManager::new(config.dependencies));
    let rt = tokio::runtime::Runtime::new()?;

    rt.block_on(async {
        if let Err(e) = deps.ensure_all().await {
            tracing::warn!("Some dependencies failed to start: {}", e);
        }
    });

    let ipc = IpcClient::new(&config.ipc.socket_path);

    let result = match memory_cmd {
        MemoryCommands::Query { query, json } => run_memory_query_internal(&ipc, &query, json, &rt),
        MemoryCommands::List {
            session,
            limit,
            json,
        } => run_memory_list_internal(&ipc, session, limit.unwrap_or(50), json, &rt),
        MemoryCommands::Modify {
            id,
            content,
            source,
            json,
        } => run_memory_modify_internal(&ipc, &id, content, source, json, &rt),
        MemoryCommands::Delete { id, json } => run_memory_delete_internal(&ipc, &id, json, &rt),
    };

    rt.block_on(async {
        if let Err(e) = deps.shutdown().await {
            tracing::warn!("Error during shutdown: {}", e);
        }
    });

    result
}

fn run_memory_query_internal(
    ipc: &sibyl_ipc::client::IpcClient,
    query: &str,
    json_output: bool,
    rt: &tokio::runtime::Runtime,
) -> anyhow::Result<()> {
    use sibyl_ipc::{Method, Request};

    let request = Request::new(Method::MemoryQuery, serde_json::json!({ "query": query }));

    let result = rt.block_on(async { ipc.send(request).await });

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
                    println!(
                        "{}",
                        serde_json::json!({ "error": "No response from memory system" })
                    );
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

    Ok(())
}

fn run_memory_list_internal(
    ipc: &sibyl_ipc::client::IpcClient,
    session: Option<String>,
    limit: usize,
    json_output: bool,
    rt: &tokio::runtime::Runtime,
) -> anyhow::Result<()> {
    use sibyl_ipc::{Method, Request};

    let params = serde_json::json!({
        "session_id": session,
        "limit": limit
    });
    let request = Request::new(Method::MemoryList, params);

    let result = rt.block_on(async { ipc.send(request).await });

    match result {
        Ok(response) => {
            if let Some(result) = response.result {
                if json_output {
                    println!("{}", serde_json::to_string_pretty(&result)?);
                } else {
                    println!("Memory List:");
                    println!("───────────────────────");
                    if let Some(episodes) = result.get("episodes").and_then(|e| e.as_array()) {
                        for episode in episodes.iter() {
                            if let (Some(id), Some(content)) = (
                                episode.get("uuid").and_then(|i| i.as_str()),
                                episode.get("content").and_then(|c| c.as_str()),
                            ) {
                                println!("ID: {}", id);
                                println!("Content: {}", content);
                                if let Some(created) =
                                    episode.get("created_at").and_then(|c| c.as_str())
                                {
                                    println!("Created: {}", created);
                                }
                                println!("───────────────────────");
                            }
                        }
                        if episodes.is_empty() {
                            println!("No memories found.");
                        } else {
                            println!("Total: {} memories", episodes.len());
                        }
                    }
                }
            } else {
                if json_output {
                    println!(
                        "{}",
                        serde_json::json!({ "error": "No response from memory system" })
                    );
                } else {
                    println!("No response from memory system.");
                }
            }
        }
        Err(e) => {
            if json_output {
                println!("{}", serde_json::json!({ "error": e.to_string() }));
            } else {
                eprintln!("Error listing memories: {}", e);
            }
            std::process::exit(1);
        }
    }

    Ok(())
}

fn run_memory_modify_internal(
    ipc: &sibyl_ipc::client::IpcClient,
    id: &str,
    content: Option<String>,
    source: Option<String>,
    json_output: bool,
    rt: &tokio::runtime::Runtime,
) -> anyhow::Result<()> {
    use sibyl_ipc::{Method, Request};

    let params = serde_json::json!({
        "episode_id": id,
        "content": content,
        "source": source
    });
    let request = Request::new(Method::MemoryModify, params);

    let result = rt.block_on(async { ipc.send(request).await });

    match result {
        Ok(response) => {
            if let Some(result) = response.result {
                if json_output {
                    println!("{}", serde_json::to_string_pretty(&result)?);
                } else {
                    let status = result
                        .get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("unknown");
                    if status == "ok" {
                        println!("Memory modified successfully.");
                        if let Some(episode) = result.get("episode") {
                            if let Some(content) = episode.get("content").and_then(|c| c.as_str()) {
                                println!("New content: {}", content);
                            }
                        }
                    } else {
                        let error = result
                            .get("error")
                            .and_then(|e| e.as_str())
                            .unwrap_or("unknown error");
                        eprintln!("Error modifying memory: {}", error);
                        std::process::exit(1);
                    }
                }
            } else if let Some(error) = response.error {
                if json_output {
                    println!("{}", serde_json::json!({ "error": error.message }));
                } else {
                    eprintln!("Error: {}", error.message);
                }
                std::process::exit(1);
            }
        }
        Err(e) => {
            if json_output {
                println!("{}", serde_json::json!({ "error": e.to_string() }));
            } else {
                eprintln!("Error modifying memory: {}", e);
            }
            std::process::exit(1);
        }
    }

    Ok(())
}

fn run_memory_delete_internal(
    ipc: &sibyl_ipc::client::IpcClient,
    id: &str,
    json_output: bool,
    rt: &tokio::runtime::Runtime,
) -> anyhow::Result<()> {
    use sibyl_ipc::{Method, Request};

    let params = serde_json::json!({ "episode_id": id });
    let request = Request::new(Method::MemoryDelete, params);

    let result = rt.block_on(async { ipc.send(request).await });

    match result {
        Ok(response) => {
            if let Some(result) = response.result {
                if json_output {
                    println!("{}", serde_json::to_string_pretty(&result)?);
                } else {
                    let status = result
                        .get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("unknown");
                    if status == "ok" {
                        println!("Memory deleted successfully.");
                    } else {
                        let error = result
                            .get("error")
                            .and_then(|e| e.as_str())
                            .unwrap_or("unknown error");
                        eprintln!("Error deleting memory: {}", error);
                        std::process::exit(1);
                    }
                }
            } else if let Some(error) = response.error {
                if json_output {
                    println!("{}", serde_json::json!({ "error": error.message }));
                } else {
                    eprintln!("Error: {}", error.message);
                }
                std::process::exit(1);
            }
        }
        Err(e) => {
            if json_output {
                println!("{}", serde_json::json!({ "error": e.to_string() }));
            } else {
                eprintln!("Error deleting memory: {}", e);
            }
            std::process::exit(1);
        }
    }

    Ok(())
}
