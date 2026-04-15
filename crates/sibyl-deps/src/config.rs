use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependenciesConfig {
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,

    #[serde(default)]
    pub opencode: OpenCodeDepConfig,

    #[serde(default)]
    pub falkordb: FalkorDBDepConfig,

    #[serde(default)]
    pub python_ipc: PythonIpcDepConfig,
}

fn default_auto_start() -> bool {
    true
}

impl Default for DependenciesConfig {
    fn default() -> Self {
        Self {
            auto_start: true,
            opencode: OpenCodeDepConfig::default(),
            falkordb: FalkorDBDepConfig::default(),
            python_ipc: PythonIpcDepConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DepMode {
    Auto,
    Attach,
    Spawn,
    Manual,
    External,
    Container,
}

impl fmt::Display for DepMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DepMode::Auto => write!(f, "auto"),
            DepMode::Attach => write!(f, "attach"),
            DepMode::Spawn => write!(f, "spawn"),
            DepMode::Manual => write!(f, "manual"),
            DepMode::External => write!(f, "external"),
            DepMode::Container => write!(f, "container"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeDepConfig {
    #[serde(default = "default_opencode_mode")]
    pub mode: DepMode,

    #[serde(default = "default_opencode_url")]
    pub url: String,

    #[serde(default = "default_opencode_spawn_command")]
    pub spawn_command: String,

    #[serde(default = "default_opencode_timeout", with = "humantime_serde")]
    pub startup_timeout: Duration,
}

fn default_opencode_mode() -> DepMode {
    DepMode::Auto
}

fn default_opencode_url() -> String {
    "http://127.0.0.1:4096".to_string()
}

fn default_opencode_spawn_command() -> String {
    "opencode serve".to_string()
}

fn default_opencode_timeout() -> Duration {
    Duration::from_secs(10)
}

impl Default for OpenCodeDepConfig {
    fn default() -> Self {
        Self {
            mode: DepMode::Auto,
            url: default_opencode_url(),
            spawn_command: default_opencode_spawn_command(),
            startup_timeout: default_opencode_timeout(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FalkorDBDepConfig {
    #[serde(default = "default_falkordb_mode")]
    pub mode: DepMode,

    #[serde(default = "default_falkordb_host")]
    pub host: String,

    #[serde(default = "default_falkordb_port")]
    pub port: u16,

    #[serde(default = "default_falkordb_container_name")]
    pub container_name: String,

    #[serde(default = "default_falkordb_docker_image")]
    pub docker_image: String,

    #[serde(default = "default_falkordb_timeout", with = "humantime_serde")]
    pub startup_timeout: Duration,
}

fn default_falkordb_host() -> String {
    "localhost".to_string()
}

fn default_falkordb_mode() -> DepMode {
    DepMode::Auto
}

fn default_falkordb_port() -> u16 {
    6379
}

fn default_falkordb_container_name() -> String {
    "sibyl-falkordb".to_string()
}

fn default_falkordb_docker_image() -> String {
    "falkordb/falkordb:latest".to_string()
}

fn default_falkordb_timeout() -> Duration {
    Duration::from_secs(15)
}

impl Default for FalkorDBDepConfig {
    fn default() -> Self {
        Self {
            mode: DepMode::Auto,
            host: default_falkordb_host(),
            port: default_falkordb_port(),
            container_name: default_falkordb_container_name(),
            docker_image: default_falkordb_docker_image(),
            startup_timeout: default_falkordb_timeout(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonIpcDepConfig {
    #[serde(default = "default_python_ipc_mode")]
    pub mode: DepMode,

    #[serde(default = "default_python_ipc_socket_path")]
    pub socket_path: String,

    #[serde(default = "default_python_ipc_spawn_command")]
    pub spawn_command: String,

    #[serde(default = "default_python_ipc_timeout", with = "humantime_serde")]
    pub startup_timeout: Duration,
}

fn default_python_ipc_mode() -> DepMode {
    DepMode::Auto
}

fn default_python_ipc_socket_path() -> String {
    "/tmp/sibyl-ipc.sock".to_string()
}

fn default_python_ipc_spawn_command() -> String {
    "python -m sibyl_ipc_server".to_string()
}

fn default_python_ipc_timeout() -> Duration {
    Duration::from_secs(5)
}

impl Default for PythonIpcDepConfig {
    fn default() -> Self {
        Self {
            mode: DepMode::Auto,
            socket_path: default_python_ipc_socket_path(),
            spawn_command: default_python_ipc_spawn_command(),
            startup_timeout: default_python_ipc_timeout(),
        }
    }
}

mod humantime_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(value: &Duration, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let secs = value.as_secs();
        serializer.serialize_str(&format!("{}s", secs))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> std::result::Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        let secs: u64 = s.trim_end_matches('s').parse().map_err(|_| {
            serde::de::Error::custom("invalid duration format, expected number followed by 's'")
        })?;
        Ok(Duration::from_secs(secs))
    }
}
