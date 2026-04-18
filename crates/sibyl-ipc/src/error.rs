use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Connection error: {0}")]
    ConnectionError(String),

    #[error("Protocol error: {0}")]
    ProtocolError(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
