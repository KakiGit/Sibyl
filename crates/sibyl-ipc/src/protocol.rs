use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub method: Method,
    pub params: serde_json::Value,
}

impl Request {
    pub fn new(method: Method, params: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            method,
            params,
        }
    }

    pub fn with_id(mut self, id: u64) -> Self {
        self.id = Some(id);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub jsonrpc: String,
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Method {
    #[serde(rename = "memory.query")]
    MemoryQuery,
    #[serde(rename = "memory.add_episode")]
    MemoryAddEpisode,
    #[serde(rename = "memory.get_context")]
    MemoryGetContext,
    #[serde(rename = "prompt.build")]
    PromptBuild,
    #[serde(rename = "relevance.evaluate")]
    RelevanceEvaluate,
}
