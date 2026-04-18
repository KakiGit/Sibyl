pub mod config;
pub mod error;
pub mod checker;
pub mod container;
pub mod falkordb;
pub mod opencode;
pub mod python_ipc;
pub mod manager;

pub use config::{DependenciesConfig, DepMode, OpenCodeDepConfig, FalkorDBDepConfig, PythonIpcDepConfig, default_opencode_url};
pub use error::{DependencyError, Result};
pub use container::{ContainerEnvironment, detect_container};
pub use manager::{DependencyManager, ServiceStatus, ServiceState};

use std::path::PathBuf;
use std::fs;
use tracing::{info, warn};

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HarnessConfig {
    #[serde(default = "default_harness")]
    pub default: String,
    
    #[serde(default)]
    pub opencode: OpenCodeHarnessConfig,
}

fn default_harness() -> String {
    "opencode".to_string()
}

impl Default for HarnessConfig {
    fn default() -> Self {
        Self {
            default: default_harness(),
            opencode: OpenCodeHarnessConfig::default(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct OpenCodeHarnessConfig {
    #[serde(default = "default_opencode_url")]
    pub url: String,
    
    #[serde(default = "default_opencode_model")]
    pub model: String,
}

fn default_opencode_model() -> String {
    "glm-5".to_string()
}

impl Default for OpenCodeHarnessConfig {
    fn default() -> Self {
        Self {
            url: default_opencode_url(),
            model: default_opencode_model(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct LlmConfig {
    #[serde(default = "default_llm_model")]
    pub model: String,
}

fn default_llm_model() -> String {
    "qwen2.5:7b".to_string()
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            model: default_llm_model(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct MemoryConfig {
    #[serde(default = "default_memory_backend")]
    pub backend: String,
    
    #[serde(default = "default_memory_host")]
    pub host: String,
    
    #[serde(default = "default_memory_port")]
    pub port: u16,
    
    #[serde(default = "default_memory_database")]
    pub database: String,
}

fn default_memory_backend() -> String {
    "falkordb".to_string()
}

fn default_memory_host() -> String {
    "localhost".to_string()
}

fn default_memory_port() -> u16 {
    6379
}

fn default_memory_database() -> String {
    "sibyl_memory".to_string()
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self {
            backend: default_memory_backend(),
            host: default_memory_host(),
            port: default_memory_port(),
            database: default_memory_database(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct IpcConfig {
    #[serde(default = "default_ipc_socket_path")]
    pub socket_path: String,
}

fn default_ipc_socket_path() -> String {
    "/tmp/sibyl-ipc.sock".to_string()
}

impl Default for IpcConfig {
    fn default() -> Self {
        Self {
            socket_path: default_ipc_socket_path(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct LoggingConfig {
    #[serde(default = "default_logging_level")]
    pub level: String,
    
    #[serde(default = "default_logging_file")]
    pub file: String,
}

fn default_logging_level() -> String {
    "info".to_string()
}

fn default_logging_file() -> String {
    "sibyl.log".to_string()
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_logging_level(),
            file: default_logging_file(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct UiConfig {
    #[serde(default = "default_history_size")]
    pub history_size: usize,
}

fn default_history_size() -> usize {
    100
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            history_size: default_history_size(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
#[derive(Default)]
pub struct SibylConfig {
    #[serde(default)]
    pub harness: HarnessConfig,
    
    #[serde(default)]
    pub llm: LlmConfig,
    
    #[serde(default)]
    pub memory: MemoryConfig,
    
    #[serde(default)]
    pub ipc: IpcConfig,
    
    #[serde(default)]
    pub dependencies: DependenciesConfig,
    
    #[serde(default)]
    pub logging: LoggingConfig,
    
    #[serde(default)]
    pub ui: UiConfig,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_config_from_file() {
        let config = load_config();
        assert_eq!(config.harness.default, "opencode");
        assert_eq!(config.harness.opencode.url, "http://localhost:4096");
        assert_eq!(config.dependencies.opencode.mode, DepMode::Attach);
    }

    #[test]
    fn test_find_config_path() {
        let path = find_config_path();
        assert!(path.is_some());
        assert!(path.unwrap().ends_with("config.yaml"));
    }

    #[test]
    fn test_sibyl_config_defaults() {
        let config = SibylConfig::default();
        assert_eq!(config.harness.default, "opencode");
        assert!(config.dependencies.auto_start);
    }
}