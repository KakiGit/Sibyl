pub mod config;
pub mod error;
pub mod checker;
pub mod container;
pub mod falkordb;
pub mod opencode;
pub mod python_ipc;
pub mod manager;

pub use config::{DependenciesConfig, DepMode, OpenCodeDepConfig, FalkorDBDepConfig, PythonIpcDepConfig};
pub use error::{DependencyError, Result};
pub use container::{ContainerEnvironment, detect_container};
pub use manager::{DependencyManager, ServiceStatus, ServiceState};

use std::path::PathBuf;
use std::fs;
use tracing::{info, warn};

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct SibylConfig {
    pub dependencies: DependenciesConfig,
}

impl Default for SibylConfig {
    fn default() -> Self {
        Self {
            dependencies: DependenciesConfig::default(),
        }
    }
}

pub fn find_config_path() -> Option<PathBuf> {
    let project_config = PathBuf::from(".sibyl/config.yaml");
    if project_config.exists() {
        return Some(project_config);
    }
    
    if let Some(home) = dirs::home_dir() {
        let home_config = home.join(".config/sibyl/config.yaml");
        if home_config.exists() {
            return Some(home_config);
        }
    }
    
    if let Some(data_dir) = dirs::data_local_dir() {
        let global_config = data_dir.join("sibyl/config.yaml");
        if global_config.exists() {
            return Some(global_config);
        }
    }
    
    None
}

pub fn load_config() -> SibylConfig {
    match find_config_path() {
        Some(path) => {
            info!("Loading config from: {:?}", path);
            match fs::read_to_string(&path) {
                Ok(contents) => {
                    match serde_yaml::from_str::<SibylConfig>(&contents) {
                        Ok(config) => {
                            info!("Config loaded successfully");
                            config
                        }
                        Err(e) => {
                            warn!("Failed to parse config file: {}", e);
                            SibylConfig::default()
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to read config file: {}", e);
                    SibylConfig::default()
                }
            }
        }
        None => {
            info!("No config file found, using defaults");
            SibylConfig::default()
        }
    }
}