use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Connection error: {0}")]
    ConnectionError(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
