use thiserror::Error;

#[derive(Debug, Error)]
pub enum DependencyError {
    #[error("Health check failed for {service}: {message}")]
    HealthCheckFailed { service: String, message: String },

    #[error("Failed to start {service}: {message}")]
    StartFailed { service: String, message: String },

    #[error("Timeout waiting for {service} to become healthy")]
    Timeout { service: String },

    #[error("Docker command failed: {message}")]
    DockerError { message: String },

    #[error("Process spawn failed for {service}: {message}")]
    ProcessSpawnFailed { service: String, message: String },

    #[error("Socket connection failed: {path}: {message}")]
    SocketError { path: String, message: String },

    #[error("HTTP request failed: {url}: {message}")]
    HttpError { url: String, message: String },

    #[error("Configuration error: {message}")]
    ConfigError { message: String },
}

pub type Result<T> = std::result::Result<T, DependencyError>;
