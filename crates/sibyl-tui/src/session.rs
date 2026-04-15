use std::sync::Arc;

use sibyl_deps::DependencyManager;
use sibyl_harness::Harness;
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::config::OpenCodeConfig;
use sibyl_opencode::types::UserMessage;

pub struct SessionRunner {
    opencode: OpenCodeClient,
    ipc: IpcClient,
    session_id: Option<String>,
    deps: Arc<DependencyManager>,
}

pub struct SessionResult {
    pub response: String,
    pub memories: Vec<String>,
    pub session_id: String,
}

impl SessionRunner {
    pub fn new(deps: Arc<DependencyManager>) -> Self {
        let opencode_config = OpenCodeConfig::default();
        let opencode = OpenCodeClient::new(opencode_config);
        let ipc = IpcClient::new("/tmp/sibyl-ipc.sock");
        
        Self {
            opencode,
            ipc,
            session_id: None,
            deps,
        }
    }

    pub async fn ensure_dependencies(&self) -> Result<(), String> {
        self.deps.ensure_all().await.map_err(|e| e.to_string())
    }

    pub async fn shutdown(&self) -> Result<(), String> {
        self.deps.shutdown().await.map_err(|e| e.to_string())
    }

    pub async fn run(&mut self, prompt: &str) -> Result<SessionResult, String> {
        let session_id = match &self.session_id {
            Some(id) => id.clone(),
            None => {
                let cwd = std::env::current_dir().ok();
                match self.opencode.create_session(cwd.as_deref()).await {
                    Ok(info) => {
                        let id = info.id;
                        self.session_id = Some(id.clone());
                        id
                    }
                    Err(e) => return Err(format!("Failed to create session: {}", e)),
                }
            }
        };

        let request = Request::new(Method::MemoryQuery, serde_json::json!({ "query": prompt }));
        let memories = self.ipc.send(request).await
            .ok()
            .and_then(|r| r.result)
            .and_then(|result| {
                result.get("episodes")
                    .and_then(|e| e.as_array())
                    .map(|episodes| {
                        episodes
                            .iter()
                            .filter_map(|e| e.get("content").and_then(|c| c.as_str()).map(String::from))
                            .collect()
                    })
            })
            .unwrap_or_default();

        let user_msg = UserMessage::new(prompt);
        self.opencode.send_user_message(&session_id, &user_msg).await
            .map_err(|e| format!("Failed to send message: {}", e))?;

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        let msgs = self.opencode.get_messages_raw(&session_id).await
            .map_err(|e| format!("Failed to get messages: {}", e))?;

        let content: String = msgs.last()
            .and_then(|v: &serde_json::Value| v.get("parts"))
            .and_then(|parts: &serde_json::Value| parts.as_array())
            .and_then(|arr| arr.iter().find(|p| {
                p.get("type").and_then(|t| t.as_str()) == Some("text")
            }))
            .and_then(|p| p.get("text").and_then(|t| t.as_str()))
            .map(String::from)
            .unwrap_or_else(|| "No response received from harness".to_string());

        let add_request = Request::new(Method::MemoryAddEpisode, serde_json::json!({
            "name": "conversation",
            "content": prompt,
            "source_description": "user conversation",
            "session_id": session_id
        }));
        let _ = self.ipc.send(add_request).await;

        Ok(SessionResult {
            response: content,
            memories,
            session_id,
        })
    }

    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

pub fn format_headless_output(result: &SessionResult, prompt: &str) -> String {
    let mut output = String::new();
    
    output.push_str(&format!("Input: {}\n", prompt));
    output.push_str("───────────────────────────\n");
    
    if !result.memories.is_empty() {
        output.push_str("Memory Context:\n");
        for memory in &result.memories {
            output.push_str(&format!("  • {}\n", memory));
        }
        output.push_str("───────────────────────────\n");
    }
    
    output.push_str("Response:\n");
    output.push_str(&result.response);
    output.push('\n');
    
    output
}