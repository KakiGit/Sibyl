use crate::error::{Error, Result};
use crate::mcp::{
    InitializeResult, McpRequest, McpResponse, McpServerConfig, McpTool, MCP_PROTOCOL_VERSION,
};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub struct McpClient {
    config: McpServerConfig,
    process: Option<Child>,
    request_id: Arc<Mutex<u64>>,
    tools: Vec<McpTool>,
    initialized: bool,
}

impl McpClient {
    pub fn new(config: McpServerConfig) -> Self {
        Self {
            config,
            process: None,
            request_id: Arc::new(Mutex::new(1)),
            tools: Vec::new(),
            initialized: false,
        }
    }

    pub async fn start(&mut self) -> Result<()> {
        let mut cmd = Command::new(&self.config.command);
        cmd.args(&self.config.args);

        for (key, value) in &self.config.env {
            cmd.env(key, value);
        }

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let process = cmd.spawn().map_err(|e| {
            Error::McpError(format!(
                "Failed to start MCP server {}: {}",
                self.config.name, e
            ))
        })?;

        self.process = Some(process);

        self.initialize().await?;

        Ok(())
    }

    async fn initialize(&mut self) -> Result<()> {
        let id = self.next_id().await;
        let request = McpRequest::new(id, "initialize").with_params(serde_json::json!({
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {
                "name": "sibyl",
                "version": "0.1.0"
            }
        }));

        let response = self.send_request(request).await?;

        if let Some(result) = response.result {
            let init_result: InitializeResult = serde_json::from_value(result).map_err(|e| {
                Error::McpError(format!("Failed to parse initialize result: {}", e))
            })?;
            tracing::info!(
                "MCP server {} initialized: {:?}",
                self.config.name,
                init_result.server_info
            );
        }

        self.initialized = true;
        self.load_tools().await?;

        Ok(())
    }

    async fn load_tools(&mut self) -> Result<()> {
        let id = self.next_id().await;
        let request = McpRequest::new(id, "tools/list");

        let response = self.send_request(request).await?;

        if let Some(result) = response.result {
            if let Some(tools) = result.get("tools") {
                self.tools = serde_json::from_value(tools.clone())
                    .map_err(|e| Error::McpError(format!("Failed to parse tools: {}", e)))?;
            }
        }

        Ok(())
    }

    pub fn tools(&self) -> &[McpTool] {
        &self.tools
    }

    pub fn config(&self) -> &McpServerConfig {
        &self.config
    }

    pub fn is_running(&self) -> bool {
        self.process.is_some() && self.initialized
    }

    async fn next_id(&self) -> u64 {
        let mut id = self.request_id.lock().await;
        let current = *id;
        *id += 1;
        current
    }

    async fn send_request(&mut self, request: McpRequest) -> Result<McpResponse> {
        let process = self
            .process
            .as_mut()
            .ok_or_else(|| Error::McpError("MCP server not started".into()))?;

        let stdin = process
            .stdin
            .as_mut()
            .ok_or_else(|| Error::McpError("Failed to access stdin".into()))?;

        let stdout = process
            .stdout
            .as_mut()
            .ok_or_else(|| Error::McpError("Failed to access stdout".into()))?;

        let request_str = serde_json::to_string(&request)
            .map_err(|e| Error::McpError(format!("Failed to serialize request: {}", e)))?;

        let content_length = request_str.len();
        let message = format!("Content-Length: {}\r\n\r\n{}", content_length, request_str);

        stdin
            .write_all(message.as_bytes())
            .await
            .map_err(|e| Error::McpError(format!("Failed to write request: {}", e)))?;
        stdin
            .flush()
            .await
            .map_err(|e| Error::McpError(format!("Failed to flush stdin: {}", e)))?;

        let mut reader = BufReader::new(stdout);
        let mut header_line = String::new();

        reader
            .read_line(&mut header_line)
            .await
            .map_err(|e| Error::McpError(format!("Failed to read header: {}", e)))?;

        let content_length: usize = header_line
            .strip_prefix("Content-Length: ")
            .and_then(|s| s.trim().parse().ok())
            .ok_or_else(|| Error::McpError("Invalid content-length header".into()))?;

        let mut empty_line = String::new();
        reader
            .read_line(&mut empty_line)
            .await
            .map_err(|e| Error::McpError(format!("Failed to read empty line: {}", e)))?;

        let mut content = vec![0u8; content_length];
        reader
            .read_exact(&mut content)
            .await
            .map_err(|e| Error::McpError(format!("Failed to read content: {}", e)))?;

        let response: McpResponse = serde_json::from_slice(&content)
            .map_err(|e| Error::McpError(format!("Failed to parse response: {}", e)))?;

        if let Some(error) = response.error {
            return Err(Error::McpError(format!(
                "MCP error {}: {}",
                error.code, error.message
            )));
        }

        Ok(response)
    }

    pub async fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let id = self.next_id().await;
        let request = McpRequest::new(id, "tools/call").with_params(serde_json::json!({
            "name": tool_name,
            "arguments": arguments
        }));

        let response = self.send_request(request).await?;

        response
            .result
            .ok_or_else(|| Error::McpError("No result in tool call response".into()))
    }

    pub async fn stop(&mut self) -> Result<()> {
        if let Some(mut process) = self.process.take() {
            process
                .kill()
                .await
                .map_err(|e| Error::McpError(format!("Failed to stop MCP server: {}", e)))?;
        }
        self.initialized = false;
        self.tools.clear();
        Ok(())
    }
}
