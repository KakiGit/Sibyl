use async_trait::async_trait;
use crate::session::SessionId;
use super::types::SessionConfig;

pub type ResponseStream = std::pin::Pin<Box<dyn futures::Stream<Item = Result<String, String>> + Send>>;

#[async_trait]
pub trait Harness: Send + Sync {
    fn name(&self) -> &str;
    
    async fn create_session(&self, config: SessionConfig) -> Result<SessionId, String>;
    
    async fn send_message(&self, session_id: &str, prompt: String) -> Result<ResponseStream, String>;
    
    async fn get_events(&self, session_id: &str) -> Result<ResponseStream, String>;
    
    async fn abort(&self, session_id: &str) -> Result<(), String>;
    
    async fn fork_session(&self, session_id: &str) -> Result<SessionId, String>;
    
    fn list_tools(&self) -> Vec<ToolSpec>;
    
    fn is_available(&self) -> bool;
}

#[derive(Debug, Clone)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}