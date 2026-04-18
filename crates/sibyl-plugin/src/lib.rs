pub mod config;
pub mod discovery;
pub mod error;
pub mod manager;
pub mod mcp;
pub mod skill;
pub mod tool;
pub mod workflow;

pub use config::PluginConfig;
pub use discovery::PluginPaths;
pub use error::{Error, Result};
pub use manager::PluginManager;
pub use mcp::{McpClient, McpManager, McpServerConfig};
pub use skill::{Skill, SkillLoader, SkillRegistry};
pub use tool::{ToolCall, ToolExecutor, ToolRegistry, ToolResult, ToolSource, ToolSpec};
pub use workflow::{Workflow, WorkflowContext, WorkflowExecutor, WorkflowLoader, WorkflowStep};
