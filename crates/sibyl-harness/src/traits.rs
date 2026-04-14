use async_trait::async_trait;
use crate::{Result, SessionInfo, Message, HarnessCapabilities};

#[async_trait]
pub trait Harness: Send + Sync {
    fn name(&self) -> &str;
    
    fn capabilities(&self) -> HarnessCapabilities;
    
    async fn create_session(&self, project_path: Option<&std::path::Path>) -> Result<SessionInfo>;
    
    async fn send_message(&self, session_id: &str, message: &Message) -> Result<String>;
    
    async fn get_messages(&self, session_id: &str) -> Result<Vec<Message>>;
    
    async fn close_session(&self, session_id: &str) -> Result<()>;
}