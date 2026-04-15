use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeConfig {
    #[serde(default = "default_url")]
    pub url: String,

    #[serde(default)]
    pub mode: ConnectionMode,

    #[serde(default)]
    pub spawn: Option<SpawnConfig>,

    #[serde(default = "default_model")]
    pub model: String,

    #[serde(default)]
    pub skills_dir: Option<String>,

    #[serde(default = "default_load_skills")]
    pub load_skills: bool,
}

fn default_url() -> String {
    "http://127.0.0.1:4096".to_string()
}

fn default_model() -> String {
    "default".to_string()
}

fn default_load_skills() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    #[default]
    Attach,
    Spawn,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnConfig {
    pub command: String,
    pub port: u16,
    #[serde(with = "humantime_serde")]
    pub wait_timeout: Duration,
}

impl Default for OpenCodeConfig {
    fn default() -> Self {
        Self {
            url: default_url(),
            mode: ConnectionMode::Attach,
            spawn: None,
            model: default_model(),
            skills_dir: None,
            load_skills: true,
        }
    }
}

impl OpenCodeConfig {
    pub fn ws_url(&self) -> String {
        self.url
            .replace("http://", "ws://")
            .replace("https://", "wss://")
    }
}

impl SpawnConfig {
    pub fn default_spawn() -> Self {
        Self {
            command: "opencode serve".to_string(),
            port: 3000,
            wait_timeout: Duration::from_secs(10),
        }
    }

    pub fn iterations(&self) -> u32 {
        (self.wait_timeout.as_millis() / 100) as u32
    }

    pub fn interval(&self) -> Duration {
        Duration::from_millis(100)
    }
}
