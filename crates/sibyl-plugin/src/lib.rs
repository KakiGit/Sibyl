pub mod skill;
pub mod tool;
pub mod workflow;
pub mod mcp;
pub mod discovery;
pub mod config;
pub mod manager;
pub mod error;

pub use skill::{Skill, SkillLoader, SkillRegistry};
pub use tool::{ToolSpec, ToolSource, ToolResult, ToolCall, ToolRegistry, ToolExecutor};
pub use workflow::{Workflow, WorkflowStep, WorkflowExecutor, WorkflowLoader, WorkflowContext};
pub use mcp::{McpServerConfig, McpManager, McpClient};
pub use config::PluginConfig;
pub use discovery::PluginPaths;
pub use manager::PluginManager;
pub use error::{Error, Result};