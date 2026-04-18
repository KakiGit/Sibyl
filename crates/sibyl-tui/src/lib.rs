pub mod app;
pub mod background;
pub mod input;
pub mod render;
pub mod session;
pub mod theme;
pub mod widgets;

pub use app::{
    App, AppMode, AppStatus, ChatState, InputState, MemoryPanelState, Message, MessageRole,
    QueuePanelState, StatusBarState,
};
pub use background::{
    create_channels, spawn_background_task, BackgroundCommand, BackgroundTask, UiEvent,
};
pub use input::{
    get_command_completions, handle_chat_key, handle_global_key, handle_memory_key,
    should_handle_as_input, Command, HandleResult, InputComposer,
};
pub use render::{
    render_chat, render_command_input, render_input, render_memory_panel, render_queue_panel,
    render_status_bar,
};
pub use session::{format_headless_output, SessionResult, SessionRunner};
pub use widgets::{render_help_overlay, CompletionPopup, Spinner, SpinnerState};
