use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tracing::debug;
use uuid::Uuid;

use crate::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: u64,
}

impl JsonRpcRequest {
    pub fn new(method: impl Into<String>, params: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            method: method.into(),
            params,
            id: Uuid::new_v4().as_u128() as u64,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl JsonRpcError {
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryQueryParams {
    pub query: String,
    pub session_id: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryQueryResult {
    pub facts: Vec<Fact>,
    pub entities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub content: String,
    pub valid_from: Option<String>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddEpisodeParams {
    pub content: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddEpisodeResult {
    pub episode_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddUserFactParams {
    pub fact: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptBuildParams {
    pub session_id: String,
    pub context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptBuildResult {
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelevanceEvaluateParams {
    pub memory_id: String,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelevanceEvaluateResult {
    pub relevance: f64,
    pub reasoning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSyncParams {
    pub session_id: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEmitParams {
    pub event_type: String,
    pub data: serde_json::Value,
}

pub struct IpcBridge {
    socket_path: PathBuf,
    timeout_ms: u64,
    pending_requests: HashMap<u64, PendingRequest>,
}

struct PendingRequest {
    method: String,
    created_at: std::time::Instant,
}

impl IpcBridge {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            timeout_ms: 30000,
            pending_requests: HashMap::new(),
        }
    }

    pub fn with_timeout(mut self, timeout_ms: u64) -> Self {
        self.timeout_ms = timeout_ms;
        self
    }

    pub async fn call(&mut self, method: &str, params: serde_json::Value) -> Result<serde_json::Value> {
        let request = JsonRpcRequest::new(method, params);
        self.pending_requests.insert(
            request.id,
            PendingRequest {
                method: method.to_string(),
                created_at: std::time::Instant::now(),
            },
        );
        
        debug!("IPC call: {} (id={})", method, request.id);
        
        let response = self.send_request(&request).await?;
        
        if let Some(error) = response.error {
            return Err(crate::Error::IpcError(sibyl_ipc::Error::ProtocolError(
                format!("{}: {}", error.code, error.message)
            )));
        }
        
        Ok(response.result.unwrap_or(serde_json::Value::Null))
    }

    async fn send_request(&self, request: &JsonRpcRequest) -> Result<JsonRpcResponse> {
        let mut stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| sibyl_ipc::Error::ConnectionError(e.to_string()))?;
        
        let request_bytes = serde_json::to_vec(request)?;
        let len = request_bytes.len() as u32;
        
        let mut buf = len.to_be_bytes().to_vec();
        buf.extend(request_bytes);
        
        stream.write_all(&buf)
            .await
            .map_err(|e| sibyl_ipc::Error::ConnectionError(e.to_string()))?;
        
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf)
            .await
            .map_err(|e| sibyl_ipc::Error::ConnectionError(e.to_string()))?;
        
        let len = u32::from_be_bytes(len_buf) as usize;
        let mut response_buf = vec![0u8; len];
        stream.read_exact(&mut response_buf)
            .await
            .map_err(|e| sibyl_ipc::Error::ConnectionError(e.to_string()))?;
        
        let response: JsonRpcResponse = serde_json::from_slice(&response_buf)?;
        Ok(response)
    }

    pub async fn memory_query(&mut self, query: &str, session_id: Option<&str>, limit: Option<usize>) -> Result<MemoryQueryResult> {
        let params = serde_json::to_value(MemoryQueryParams {
            query: query.to_string(),
            session_id: session_id.map(String::from),
            limit,
        })?;
        
        let result = self.call("memory.query", params).await?;
        
        if result.is_null() {
            return Ok(MemoryQueryResult {
                facts: Vec::new(),
                entities: Vec::new(),
            });
        }
        
        serde_json::from_value(result)
            .map_err(|e| sibyl_ipc::Error::ProtocolError(e.to_string()).into())
    }

    pub async fn memory_add_episode(&mut self, content: &str, session_id: &str) -> Result<String> {
        let params = serde_json::to_value(AddEpisodeParams {
            content: content.to_string(),
            session_id: session_id.to_string(),
        })?;
        
        let result = self.call("memory.add_episode", params).await?;
        
        let episode: AddEpisodeResult = serde_json::from_value(result)
            .map_err(|e| sibyl_ipc::Error::ProtocolError(e.to_string()))?;
        
        Ok(episode.episode_id)
    }

    pub async fn memory_add_user_fact(&mut self, fact: &str, session_id: &str) -> Result<String> {
        let params = serde_json::to_value(AddUserFactParams {
            fact: fact.to_string(),
            session_id: session_id.to_string(),
        })?;
        
        let result = self.call("memory.add_user_fact", params).await?;
        
        let episode: AddEpisodeResult = serde_json::from_value(result)
            .map_err(|e| sibyl_ipc::Error::ProtocolError(e.to_string()))?;
        
        Ok(episode.episode_id)
    }

    pub async fn prompt_build(&mut self, session_id: &str, context: Option<&str>) -> Result<String> {
        let params = serde_json::to_value(PromptBuildParams {
            session_id: session_id.to_string(),
            context: context.map(String::from),
        })?;
        
        let result = self.call("prompt.build", params).await?;
        
        let prompt: PromptBuildResult = serde_json::from_value(result)
            .map_err(|e| sibyl_ipc::Error::ProtocolError(e.to_string()))?;
        
        Ok(prompt.prompt)
    }

    pub async fn relevance_evaluate(&mut self, memory_id: &str, context: &str) -> Result<f64> {
        let params = serde_json::to_value(RelevanceEvaluateParams {
            memory_id: memory_id.to_string(),
            context: context.to_string(),
        })?;
        
        let result = self.call("relevance.evaluate", params).await?;
        
        let relevance: RelevanceEvaluateResult = serde_json::from_value(result)
            .map_err(|e| sibyl_ipc::Error::ProtocolError(e.to_string()))?;
        
        Ok(relevance.relevance)
    }
}