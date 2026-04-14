use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Session error: {0}")]
    SessionError(String),

    #[error("Harness error: {0}")]
    HarnessError(String),

    #[error("IPC error: {0}")]
    IpcError(#[from] sibyl_ipc::Error),

    #[error("Plugin error: {0}")]
    PluginError(#[from] sibyl_plugin::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Configuration error: {0}")]
    ConfigError(String),
}

pub type Result<T> = std::result::Result<T, Error>;
