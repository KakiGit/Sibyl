use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::ipc::IpcConfig;
use crate::session::HarnessType;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub harness: HarnessConfigWrapper,
    #[serde(default)]
    pub memory: MemoryConfig,
    #[serde(default)]
    pub ipc: IpcConfig,
    #[serde(default)]
    pub ui: UiConfig,
    #[serde(default)]
    pub plugins: PluginConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HarnessConfigWrapper {
    #[serde(default)]
    pub default: HarnessType,
    #[serde(default)]
    pub opencode: OpenCodeConfigWrapper,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeConfigWrapper {
    #[serde(default = "default_opencode_url")]
    pub url: String,
    #[serde(default)]
    pub mode: OpenCodeModeWrapper,
    #[serde(default = "default_opencode_port")]
    pub port: u16,
}

fn default_opencode_url() -> String {
    "http://127.0.0.1".to_string()
}

fn default_opencode_port() -> u16 {
    3000
}

impl Default for OpenCodeConfigWrapper {
    fn default() -> Self {
        Self {
            url: default_opencode_url(),
            mode: OpenCodeModeWrapper::default(),
            port: default_opencode_port(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum OpenCodeModeWrapper {
    #[default]
    Auto,
    Spawn,
    Attach,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    #[serde(default = "default_memory_backend")]
    pub backend: String,
    #[serde(default = "default_memory_host")]
    pub host: String,
    #[serde(default = "default_memory_port")]
    pub port: u16,
    #[serde(default = "default_embedding_model")]
    pub embedding_model: String,
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

fn default_embedding_model() -> String {
    "sentence-transformers/all-MiniLM-L6-v2".to_string()
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self {
            backend: default_memory_backend(),
            host: default_memory_host(),
            port: default_memory_port(),
            embedding_model: default_embedding_model(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    #[serde(default)]
    pub theme: String,
    #[serde(default = "default_scrollback")]
    pub scrollback_lines: usize,
}

fn default_scrollback() -> usize {
    10000
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            scrollback_lines: default_scrollback(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub directories: Vec<PathBuf>,
}

impl Default for PluginConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            directories: vec![PathBuf::from("plugins")],
        }
    }
}
