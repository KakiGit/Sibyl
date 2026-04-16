use crate::config::OpenCodeConfig;
use crate::types::*;
use crate::spawn::OpenCodeProcess;
use crate::websocket::{WebSocketClient, EventStream};
use crate::Error;
use sibyl_harness::{Harness, SessionInfo, Message, HarnessCapabilities, Error as HarnessError};
use async_trait::async_trait;
use reqwest::Client;
use std::path::Path;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::Duration;

pub struct OpenCodeClient {
    http: Client,
    config: OpenCodeConfig,
    process: Option<Arc<OpenCodeProcess>>,
    event_stream: Arc<RwLock<Option<EventStream>>>,
    sessions: Arc<RwLock<HashMap<String, String>>>,
}

impl OpenCodeClient {
    pub fn new(config: OpenCodeConfig) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap();
        
        Self {
            http,
            config,
            process: None,
            event_stream: Arc::new(RwLock::new(None)),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub fn with_process(mut self, process: OpenCodeProcess) -> Self {
        self.process = Some(Arc::new(process));
        self
    }
    
    pub async fn health_check(&self) -> crate::Result<()> {
        let url = format!("{}/global/health", self.config.url);
        self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        Ok(())
    }
    
    pub async fn connect_events(&self) -> crate::Result<()> {
        let ws = WebSocketClient::new(self.config.ws_url() + "/event");
        let stream = ws.connect().await?;
        let mut guard = self.event_stream.write().await;
        *guard = Some(stream);
        Ok(())
    }
    
    pub async fn create_session_raw(&self, config: &SessionConfig) -> crate::Result<SessionResponse> {
        let mut url = format!("{}/session", self.config.url);
        if let Some(dir) = &config.working_directory {
            url = format!("{}?directory={}", url, urlencoding::encode(dir));
        }
        let response = self.http
            .post(&url)
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn get_session(&self, session_id: &str) -> crate::Result<SessionInfo> {
        let url = format!("{}/session/{}", self.config.url, session_id);
        let response = self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn send_user_message(&self, session_id: &str, message: &UserMessage) -> crate::Result<()> {
        let url = format!("{}/session/{}/message", self.config.url, session_id);
        self.http
            .post(&url)
            .json(message)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        Ok(())
    }
    
    pub async fn get_messages_raw(&self, session_id: &str) -> crate::Result<Vec<serde_json::Value>> {
        let url = format!("{}/session/{}/message", self.config.url, session_id);
        let response = self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn abort_session(&self, session_id: &str) -> crate::Result<()> {
        let url = format!("{}/session/{}/abort", self.config.url, session_id);
        self.http
            .post(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        Ok(())
    }
    
    pub async fn fork_session(&self, session_id: &str) -> crate::Result<ForkResponse> {
        let url = format!("{}/session/{}/fork", self.config.url, session_id);
        let response = self.http
            .post(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn delete_session(&self, session_id: &str) -> crate::Result<()> {
        let url = format!("{}/session/{}", self.config.url, session_id);
        self.http
            .delete(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        Ok(())
    }
    
    pub async fn list_agents(&self) -> crate::Result<Vec<AgentInfo>> {
        let url = format!("{}/agent", self.config.url);
        let response = self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn list_skills(&self) -> crate::Result<Vec<SkillInfo>> {
        let url = format!("{}/skill", self.config.url);
        let response = self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn list_mcp_servers(&self) -> crate::Result<Vec<McpServerInfo>> {
        let url = format!("{}/mcp", self.config.url);
        let response = self.http
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        
        response.json()
            .await
            .map_err(|e| Error::InvalidResponse(e.to_string()))
    }
    
    pub async fn start_mcp_server(&self, name: &str) -> crate::Result<()> {
        let url = format!("{}/mcp/{}/start", self.config.url, name);
        self.http
            .post(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        Ok(())
    }
    
    pub async fn stop_mcp_server(&self, name: &str) -> crate::Result<()> {
        let url = format!("{}/mcp/{}/stop", self.config.url, name);
        self.http
            .post(&url)
            .send()
            .await
            .map_err(|e| Error::RequestFailed(e.to_string()))?;
        Ok(())
    }
    
    pub fn list_tools(&self) -> Vec<ToolSpec> {
        vec![
            ToolSpec { name: "read_file".to_string(), description: "Read file contents".to_string() },
            ToolSpec { name: "write_file".to_string(), description: "Write to file".to_string() },
            ToolSpec { name: "bash".to_string(), description: "Execute bash command".to_string() },
            ToolSpec { name: "grep".to_string(), description: "Search files".to_string() },
        ]
    }
    
    pub fn is_available(&self) -> bool {
        let url = format!("{}/health", self.config.url);
        self.http.get(&url).build().is_ok()
    }
}

fn map_error(e: Error) -> HarnessError {
    match e {
        Error::ConnectionError(msg) => HarnessError::ConnectionError(msg),
        Error::RequestFailed(msg) => HarnessError::RequestFailed(msg),
        Error::InvalidResponse(msg) => HarnessError::InvalidResponse(msg),
        Error::SessionNotFound(msg) => HarnessError::SessionNotFound(msg),
        Error::IoError(e) => HarnessError::IoError(e),
        _ => HarnessError::ConnectionError(e.to_string()),
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

    async fn create_session(&self, project_path: Option<&Path>) -> sibyl_harness::Result<SessionInfo> {
        let config = SessionConfig {
            model: Some(self.config.model.clone()),
            working_directory: project_path.map(|p| p.to_string_lossy().to_string()),
            skills: None,
        };
        
        let response = self.create_session_raw(&config).await.map_err(map_error)?;
        
        Ok(SessionInfo {
            id: response.id,
            project_path: project_path.map(|p| p.to_string_lossy().to_string()),
            created_at: chrono::Utc::now(),
        })
    }

    async fn send_message(&self, session_id: &str, message: &Message) -> sibyl_harness::Result<String> {
        let user_msg = UserMessage::new(&message.content);
        self.send_user_message(session_id, &user_msg).await.map_err(map_error)?;
        Ok(format!("Message sent to session {}", session_id))
    }

    async fn get_messages(&self, session_id: &str) -> sibyl_harness::Result<Vec<Message>> {
        let raw = self.get_messages_raw(session_id).await.map_err(map_error)?;
        
        let messages: Vec<Message> = raw
            .into_iter()
            .filter_map(|v| {
                let content = v.get("content")?.as_str()?.to_string();
                let role_str = v.get("role")?.as_str()?;
                let role = match role_str {
                    "user" => sibyl_harness::Role::User,
                    "assistant" => sibyl_harness::Role::Assistant,
                    "system" => sibyl_harness::Role::System,
                    _ => return None,
                };
                Some(Message {
                    role,
                    content,
                    timestamp: chrono::Utc::now(),
                })
            })
            .collect();
        
        Ok(messages)
    }

    async fn close_session(&self, session_id: &str) -> sibyl_harness::Result<()> {
        self.delete_session(session_id).await.map_err(map_error)
    }
}