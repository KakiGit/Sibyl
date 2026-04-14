use crate::mcp::McpServerConfig;
use crate::skill::SKILL_SEARCH_PATHS;
use crate::workflow::WORKFLOW_SEARCH_PATHS;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginConfig {
    #[serde(default)]
    pub skills: SkillConfig,
    #[serde(default)]
    pub workflows: WorkflowConfig,
    #[serde(default)]
    pub mcp_servers: Vec<McpServerEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillConfig {
    #[serde(default = "default_true")]
    pub autoload: bool,
    #[serde(default = "default_skill_paths")]
    pub search_paths: Vec<String>,
}

impl Default for SkillConfig {
    fn default() -> Self {
        Self {
            autoload: true,
            search_paths: default_skill_paths(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_skill_paths() -> Vec<String> {
    SKILL_SEARCH_PATHS
        .iter()
        .map(|s: &&str| s.to_string())
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    #[serde(default = "default_true")]
    pub autoload: bool,
    #[serde(default = "default_workflow_paths")]
    pub search_paths: Vec<String>,
}

impl Default for WorkflowConfig {
    fn default() -> Self {
        Self {
            autoload: true,
            search_paths: default_workflow_paths(),
        }
    }
}

fn default_workflow_paths() -> Vec<String> {
    WORKFLOW_SEARCH_PATHS
        .iter()
        .map(|s: &&str| s.to_string())
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerEntry {
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

impl From<McpServerEntry> for McpServerConfig {
    fn from(entry: McpServerEntry) -> Self {
        Self {
            name: entry.name,
            enabled: entry.enabled,
            command: entry.command,
            args: entry.args,
            env: entry.env,
        }
    }
}

impl PluginConfig {
    pub fn load(path: &PathBuf) -> crate::error::Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(path)?;
        let config: Self = serde_yaml::from_str(&content).map_err(|e| {
            crate::error::Error::ParseError(format!("Failed to parse config: {}", e))
        })?;

        Ok(config)
    }

    pub fn save(&self, path: &PathBuf) -> crate::error::Result<()> {
        let content = serde_yaml::to_string(self).map_err(|e| {
            crate::error::Error::ParseError(format!("Failed to serialize config: {}", e))
        })?;

        std::fs::write(path, content)?;
        Ok(())
    }

    pub fn skill_paths(&self) -> Vec<PathBuf> {
        self.skills.search_paths.iter().map(PathBuf::from).collect()
    }

    pub fn workflow_paths(&self) -> Vec<PathBuf> {
        self.workflows
            .search_paths
            .iter()
            .map(PathBuf::from)
            .collect()
    }

    pub fn enabled_mcp_servers(&self) -> Vec<McpServerConfig> {
        self.mcp_servers
            .iter()
            .filter(|s| s.enabled)
            .map(|s| McpServerConfig::from(s.clone()))
            .collect()
    }

    pub fn with_mcp_server(mut self, server: McpServerEntry) -> Self {
        self.mcp_servers.push(server);
        self
    }
}
