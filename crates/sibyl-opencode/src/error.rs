use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Connection error: {0}")]
    ConnectionError(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("WebSocket error: {0}")]
    WebSocketError(String),

    #[error("Harness error: {0}")]
    HarnessError(#[from] sibyl_harness::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Spawn error: {0}")]
    SpawnError(String),
}

pub type Result<T> = std::result::Result<T, Error>;
