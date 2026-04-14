use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Session error: {0}")]
    SessionError(#[from] sibyl_harness::Error),

    #[error("IPC error: {0}")]
    IpcError(#[from] sibyl_ipc::Error),

    #[error("Plugin error: {0}")]
    PluginError(#[from] sibyl_plugin::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;