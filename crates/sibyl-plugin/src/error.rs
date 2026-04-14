use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Plugin not found: {0}")]
    PluginNotFound(String),

    #[error("Plugin load error: {0}")]
    PluginLoadError(String),

    #[error("Invalid plugin: {0}")]
    InvalidPlugin(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;