pub mod config;
pub mod error;
pub mod checker;
pub mod falkordb;
pub mod opencode;
pub mod python_ipc;
pub mod manager;

pub use config::{DependenciesConfig, DepMode, OpenCodeDepConfig, FalkorDBDepConfig, PythonIpcDepConfig};
pub use error::{DependencyError, Result};
pub use manager::{DependencyManager, ServiceStatus, ServiceState};