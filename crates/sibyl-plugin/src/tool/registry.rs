use crate::error::{Error, Result};
use crate::tool::ToolExecutor;
use crate::tool::{ToolCall, ToolResult, ToolSource, ToolSpec};
use std::collections::HashMap;
use std::sync::Arc;

pub struct ToolRegistry {
    harness_tools: HashMap<String, ToolSpec>,
    sibyl_tools: HashMap<String, ToolSpec>,
    mcp_tools: HashMap<String, (String, ToolSpec)>,
    executors: HashMap<String, Arc<dyn ToolExecutor>>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            harness_tools: HashMap::new(),
            sibyl_tools: HashMap::new(),
            mcp_tools: HashMap::new(),
            executors: HashMap::new(),
        }
    }

    pub fn register_harness_tool(&mut self, tool: ToolSpec) {
        let mut tool = tool;
        tool.source = ToolSource::Harness;
        self.harness_tools.insert(tool.name.clone(), tool);
    }

    pub fn register_sibyl_tool(&mut self, tool: ToolSpec) {
        let mut tool = tool;
        tool.source = ToolSource::Sibyl;
        self.sibyl_tools.insert(tool.name.clone(), tool);
    }

    pub fn register_mcp_tool(&mut self, tool: ToolSpec, server: String) {
        let mut tool = tool;
        tool.source = ToolSource::Mcp {
            server: server.clone(),
        };
        self.mcp_tools.insert(tool.name.clone(), (server, tool));
    }

    pub fn register_executor(&mut self, executor: Arc<dyn ToolExecutor>) {
        self.executors.insert(executor.name().to_string(), executor);
    }

    pub fn get(&self, name: &str) -> Option<&ToolSpec> {
        self.harness_tools
            .get(name)
            .or_else(|| self.sibyl_tools.get(name))
            .or_else(|| self.mcp_tools.get(name).map(|(_, spec)| spec))
    }

    pub fn all_tools(&self) -> Vec<&ToolSpec> {
        let mut tools: Vec<&ToolSpec> = self.harness_tools.values().collect();
        tools.extend(self.sibyl_tools.values());
        tools.extend(self.mcp_tools.values().map(|(_, spec)| spec));
        tools
    }

    pub fn harness_tools(&self) -> Vec<&ToolSpec> {
        self.harness_tools.values().collect()
    }

    pub fn sibyl_tools(&self) -> Vec<&ToolSpec> {
        self.sibyl_tools.values().collect()
    }

    pub fn mcp_tools(&self) -> Vec<&ToolSpec> {
        self.mcp_tools.values().map(|(_, spec)| spec).collect()
    }

    pub fn has_tool(&self, name: &str) -> bool {
        self.harness_tools.contains_key(name)
            || self.sibyl_tools.contains_key(name)
            || self.mcp_tools.contains_key(name)
    }

    pub fn find_mcp_server(&self, tool_name: &str) -> Option<&str> {
        self.mcp_tools
            .get(tool_name)
            .map(|(server, _)| server.as_str())
    }

    pub async fn execute(&self, call: ToolCall) -> Result<ToolResult> {
        if let Some(executor) = self.executors.get(&call.name) {
            return executor.execute(call).await;
        }

        if call.name.starts_with("memory_") {
            if let Some(executor) = self.executors.get(&call.name) {
                return executor.execute(call).await;
            }
            return Err(Error::ToolNotRegistered(call.name));
        }

        if self.mcp_tools.contains_key(&call.name) {
            return Err(Error::McpNotConnected(call.name));
        }

        Err(Error::ToolNotRegistered(call.name))
    }

    pub fn clear(&mut self) {
        self.harness_tools.clear();
        self.sibyl_tools.clear();
        self.mcp_tools.clear();
        self.executors.clear();
    }

    pub fn len(&self) -> usize {
        self.harness_tools.len() + self.sibyl_tools.len() + self.mcp_tools.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}
