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

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Skill not found: {0}")]
    SkillNotFound(String),

    #[error("Workflow not found: {0}")]
    WorkflowNotFound(String),

    #[error("Tool not registered: {0}")]
    ToolNotRegistered(String),

    #[error("MCP server not found: {0}")]
    McpServerNotFound(String),

    #[error("MCP not connected for tool: {0}")]
    McpNotConnected(String),

    #[error("MCP error: {0}")]
    McpError(String),

    #[error("Missing required variable: {0}")]
    MissingVariable(String),

    #[error("Invalid workflow step: {0}")]
    InvalidWorkflowStep(String),

    #[error("YAML error: {0}")]
    YamlError(#[from] serde_yaml::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
