pub mod app;
pub mod background;
pub mod input;
pub mod render;
pub mod theme;
pub mod widgets;
pub mod session;

pub use app::{
    App, AppMode, AppStatus, ChatState, InputState, MemoryPanelState, 
    Message, MessageRole, StatusBarState, QueuePanelState,
};
pub use background::{
    UiEvent, BackgroundCommand,
    create_channels, spawn_background_task_with_events,
    BackgroundTask,
};
pub use input::{
    Command, InputComposer, HandleResult,
    handle_global_key, handle_chat_key, handle_memory_key, should_handle_as_input,
    get_command_completions,
};
pub use widgets::{Spinner, SpinnerState, render_help_overlay, CompletionPopup};
pub use render::{
    render_chat, render_input, render_memory_panel, render_status_bar,
    render_command_input, render_queue_panel,
};
pub use session::{SessionRunner, SessionResult, format_headless_output};