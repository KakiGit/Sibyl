pub use crate::session::HarnessType;

#[derive(Debug, Clone)]
pub struct HarnessConfig {
    pub default: HarnessType,
    pub opencode: OpenCodeConfig,
}

impl Default for HarnessConfig {
    fn default() -> Self {
        Self {
            default: HarnessType::OpenCode,
            opencode: OpenCodeConfig::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct OpenCodeConfig {
    pub url: String,
    pub mode: OpenCodeMode,
    pub port: u16,
}

impl Default for OpenCodeConfig {
    fn default() -> Self {
        Self {
            url: "http://127.0.0.1".to_string(),
            mode: OpenCodeMode::Auto,
            port: 3000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenCodeMode {
    Spawn,
    Attach,
    Auto,
}

#[derive(Debug, Clone)]
pub struct SessionConfig {
    pub project_path: Option<std::path::PathBuf>,
    pub harness: HarnessType,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            project_path: None,
            harness: HarnessType::default(),
        }
    }
}
