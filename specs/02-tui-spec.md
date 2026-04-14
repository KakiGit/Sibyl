# TUI Implementation Specification

## Technology Stack

- **Framework**: Ratatui (Rust TUI library)
- **Pattern**: Event-driven with async support (tokio)
- **Reference**: claw-code `rust/render.rs`, codex `tui/` crate

## Components

### Main Layout

```
┌─────────────────────────────────────────┐
│ Status Bar (model, session, memory stats)│
├─────────────────────────────────────────┤
│                                         │
│         Chat History Panel              │
│   (Markdown rendering, streaming)       │
│                                         │
├─────────────────────────────────────────┤
│ Memory Context Panel (collapsible)      │
│   Shows injected memories                │
├─────────────────────────────────────────┤
│ Input Panel (prompt composer)           │
│   Slash commands, skill selection       │
└─────────────────────────────────────────┘
```

### Alternative Layouts

**Split View (for memory exploration):**
```
┌──────────────────┬──────────────────────┐
│   Chat Panel     │    Memory Panel      │
│                  │   (Entity/Fact list) │
├──────────────────┴──────────────────────┤
│             Input Panel                  │
└─────────────────────────────────────────┘
```

## Key Features

### 1. Markdown Rendering
- **Library**: `pulldown-cmark` for parsing
- **Syntax Highlighting**: `syntect` for code blocks
- **ANSI Output**: Custom renderer converting markdown to terminal ANSI codes

### 2. Streaming Support
- Incremental markdown parsing for live responses
- Progress spinner during tool execution
- Real-time message updates from WebSocket

### 3. Memory Panel
- Collapsible view showing injected memories
- Entity/fact browsing interface
- Query input for memory search

### 4. Command Palette
- `/help` - Show available commands
- `/skill <name>` - Load a skill
- `/memory query <text>` - Search memories
- `/switch-harness <name>` - Change harness (future)
- `/clear` - Clear chat history

### 5. Key Bindings (vim-style)

| Key | Action |
|-----|--------|
| `j/k` | Scroll chat history |
| `Ctrl+d/u` | Half-page scroll |
| `Enter` | Send message |
| `Tab` | Toggle memory panel |
| `Ctrl+c` | Abort current operation |
| `Esc` | Cancel input |
| `?` | Show help |

## Rust Crate Structure

```
sibyl-tui/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point, event loop
│   ├── app.rs               # Application state machine
│   ├── render/
│   │   ├── mod.rs
│   │   ├── chat.rs          # Chat history renderer
│   │   ├── markdown.rs      # Markdown → ANSI conversion
│   │   ├── memory.rs        # Memory context display
│   │   ├── status.rs        # Status bar
│   │   └── input.rs         # Input field renderer
│   ├── input/
│   │   ├── mod.rs
│   │   ├── handler.rs       # Keyboard event handling
│   │   ├── composer.rs      # Multi-line input buffer
│   │   └── commands.rs      # Slash command parser
│   ├── widgets/
│   │   ├── mod.rs
│   │   ├── spinner.rs       # Progress indicator
│   │   ├── completion.rs    # Tab completion popup
│   │   └── scrollbar.rs     # Custom scrollbar
│   └── theme/
│   │   ├── mod.rs
│   │   ├── colors.rs        # Color scheme definitions
│   │   └── styles.rs        # Style presets
```

## Dependencies

```toml
[dependencies]
ratatui = "0.28"
tokio = { version = "1", features = ["full"] }
crossterm = "0.28"              # Terminal backend
pulldown-cmark = "0.12"         # Markdown parsing
syntect = "5.2"                 # Syntax highlighting
serde = { version = "1", features = ["derive"] }
serde_json = "1"
unicode-width = "0.2"           # Character width calculation
```

## App State Structure

```rust
pub struct App {
    pub mode: AppMode,              // Chat, MemoryView, CommandPalette
    pub chat: ChatState,
    pub memory: MemoryPanelState,
    pub input: InputState,
    pub status: StatusBarState,
    pub config: Config,
}

pub enum AppMode {
    Chat,
    MemoryView,
    CommandPalette,
    HelpOverlay,
}

pub struct ChatState {
    pub messages: Vec<Message>,
    pub scroll_offset: usize,
    pub streaming: bool,
    pub current_response: Option<String>,
}

pub struct Message {
    pub role: Role,              // User, Assistant, System
    pub content: String,
    pub timestamp: DateTime,
    pub memories_injected: Vec<String>,
}
```

## Event Loop Design

```rust
async fn run_app() -> Result<()> {
    let mut app = App::new();
    
    loop {
        // Poll events (keyboard, IPC, WebSocket)
        let event = select!(
            key_event = read_key() => Event::Key(key_event),
            ipc_msg = ipc_client.recv() => Event::Ipc(ipc_msg),
            ws_msg = ws_client.recv() => Event::WebSocket(ws_msg),
        );
        
        match event {
            Event::Key(key) => app.handle_key(key),
            Event::Ipc(msg) => app.handle_ipc(msg),
            Event::WebSocket(msg) => app.handle_ws(msg),
        }
        
        // Render
        terminal.draw(|f| render_app(f, &app))?;
        
        // Check for exit
        if app.should_quit() {
            break;
        }
    }
}
```

## Rendering Strategy

### Chat Panel Rendering

1. Calculate visible message range based on scroll offset
2. For each message:
   - Parse markdown with pulldown-cmark
   - Apply syntax highlighting to code blocks
   - Convert to ANSI-styled text
   - Render with appropriate role color (user: blue, assistant: green)
3. Render scroll indicator

### Streaming Response Rendering

1. Accumulate incoming text chunks
2. Re-parse markdown incrementally
3. Update visible content immediately
4. Auto-scroll to bottom on new content

## Color Theme

```
Background:    #1a1b26 (dark blue-gray)
Foreground:    #c0caf5 (light blue-white)
User Message:  #7aa2f7 (blue)
Assistant:     #9ece6a (green)
System:        #565f89 (gray)
Code Block:    #24283b (darker bg)
Border:        #3d59a1 (blue accent)
Memory:        #e0af68 (yellow highlight)
Error:         #f7768e (red)
```