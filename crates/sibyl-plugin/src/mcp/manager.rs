use crate::error::Result;
use crate::mcp::{McpClient, McpServerConfig, McpTool};
use crate::tool::{ToolCall, ToolExecutor, ToolResult, ToolSpec};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct McpManager {
    servers: HashMap<String, McpClient>,
}

impl Default for McpManager {
    fn default() -> Self {
        Self::new()
    }
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }

    pub async fn add_server(&mut self, config: McpServerConfig) -> Result<()> {
        let name = config.name.clone();
        let mut client = McpClient::new(config);
        client.start().await?;
        self.servers.insert(name, client);
        Ok(())
    }

    pub fn remove_server(&mut self, name: &str) {
        self.servers.remove(name);
    }

    pub fn get_server(&self, name: &str) -> Option<&McpClient> {
        self.servers.get(name)
    }

    pub fn get_server_mut(&mut self, name: &str) -> Option<&mut McpClient> {
        self.servers.get_mut(name)
    }

    pub fn list_servers(&self) -> Vec<&str> {
        self.servers.keys().map(|s| s.as_str()).collect()
    }

    pub fn all_tools(&self) -> Vec<(&str, &McpTool)> {
        let mut tools = Vec::new();
        for (server_name, client) in &self.servers {
            for tool in client.tools() {
                tools.push((server_name.as_str(), tool));
            }
        }
        tools
    }

    pub fn tool_specs(&self) -> Vec<ToolSpec> {
        self.all_tools()
            .into_iter()
            .map(|(server, tool)| {
                ToolSpec::mcp(
                    &tool.name,
                    &tool.description,
                    tool.input_schema.clone(),
                    server,
                )
            })
            .collect()
    }

    pub async fn call_tool(
        &mut self,
        server_name: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let client = self
            .servers
            .get_mut(server_name)
            .ok_or_else(|| crate::error::Error::McpServerNotFound(server_name.to_string()))?;
        client.call_tool(tool_name, arguments).await
    }

    pub async fn stop_all(&mut self) {
        for (name, client) in &mut self.servers {
            if let Err(e) = client.stop().await {
                tracing::warn!("Failed to stop MCP server {}: {}", name, e);
            }
        }
        self.servers.clear();
    }
}

pub struct McpToolExecutor {
    manager: Arc<Mutex<McpManager>>,
    server_name: String,
}

impl McpToolExecutor {
    pub fn new(manager: Arc<Mutex<McpManager>>, server_name: impl Into<String>) -> Self {
        Self {
            manager,
            server_name: server_name.into(),
        }
    }
}

#[async_trait]
impl ToolExecutor for McpToolExecutor {
    async fn execute(&self, call: ToolCall) -> Result<ToolResult> {
        let mut manager = self.manager.lock().await;
        match manager
            .call_tool(&self.server_name, &call.name, call.arguments)
            .await
        {
            Ok(result) => Ok(ToolResult::success(result)),
            Err(e) => Ok(ToolResult::error(e.to_string())),
        }
    }

    fn name(&self) -> &str {
        &self.server_name
    }
}
