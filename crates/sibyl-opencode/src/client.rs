use sibyl_harness::{Harness, SessionInfo, Message, HarnessCapabilities, Result, Error};
use async_trait::async_trait;
use reqwest::Client;
use std::path::Path;

pub struct OpenCodeClient {
    base_url: String,
    client: Client,
}

impl OpenCodeClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: Client::new(),
        }
    }
}

#[async_trait]
impl Harness for OpenCodeClient {
    fn name(&self) -> &str {
        "opencode"
    }

    fn capabilities(&self) -> HarnessCapabilities {
        HarnessCapabilities {
            streaming: true,
            file_operations: true,
            shell_access: true,
            web_search: false,
        }
    }

    async fn create_session(&self, project_path: Option<&Path>) -> Result<SessionInfo> {
        let url = format!("{}/session", self.base_url);
        let response = self.client
            .post(&url)
            .json(&serde_json::json!({ "project_path": project_path }))
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json::<SessionInfo>()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }

    async fn send_message(&self, session_id: &str, message: &Message) -> Result<String> {
        let url = format!("{}/session/{}/message", self.base_url, session_id);
        let response = self.client
            .post(&url)
            .json(message)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        let body = response.text()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))?;
        
        Ok(body)
    }

    async fn get_messages(&self, session_id: &str) -> Result<Vec<Message>> {
        let url = format!("{}/session/{}/message", self.base_url, session_id);
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json::<Vec<Message>>()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        let url = format!("{}/session/{}", self.base_url, session_id);
        self.client
            .delete(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        Ok(())
    }
}