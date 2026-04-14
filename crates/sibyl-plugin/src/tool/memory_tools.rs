use async_trait::async_trait;
use crate::error::Result;
use crate::tool::{ToolResult, ToolCall};
use std::sync::Arc;

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(&self, call: ToolCall) -> Result<ToolResult>;
    fn name(&self) -> &str;
}

pub struct MemoryQueryTool;

impl MemoryQueryTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ToolExecutor for MemoryQueryTool {
    async fn execute(&self, call: ToolCall) -> Result<ToolResult> {
        let query = call.arguments.get("query")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        
        Ok(ToolResult::success(serde_json::json!({
            "query": query,
            "results": [],
            "message": "Memory query tool not yet connected to Python backend"
        })))
    }

    fn name(&self) -> &str {
        "memory_query"
    }
}

pub struct MemoryAddTool;

impl MemoryAddTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ToolExecutor for MemoryAddTool {
    async fn execute(&self, call: ToolCall) -> Result<ToolResult> {
        let content = call.arguments.get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        
        Ok(ToolResult::success(serde_json::json!({
            "content": content,
            "message": "Memory add tool not yet connected to Python backend"
        })))
    }

    fn name(&self) -> &str {
        "memory_add"
    }
}

pub fn sibyl_memory_tools() -> Vec<Arc<dyn ToolExecutor>> {
    vec![
        Arc::new(MemoryQueryTool::new()),
        Arc::new(MemoryAddTool::new()),
    ]
}