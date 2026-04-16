use std::sync::Arc;

use sibyl_deps::{DependencyManager, SibylConfig};
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
    config: SibylConfig,
}

pub struct SessionResult {
    pub response: String,
    pub memories: Vec<String>,
    pub session_id: String,
}

impl SessionRunner {
    pub fn new(deps: Arc<DependencyManager>, config: SibylConfig) -> Self {
        let opencode_config = OpenCodeConfig {
            url: config.harness.opencode.url.clone(),
            model: config.harness.opencode.model.clone(),
            ..Default::default()
        };
        let opencode = OpenCodeClient::new(opencode_config);
        let ipc = IpcClient::new(&config.ipc.socket_path);
        
        Self {
            opencode,
            ipc,
            session_id: None,
            deps,
            config,
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

        let query_request = Request::new(Method::MemoryQuery, serde_json::json!({ 
            "query": prompt,
            "session_id": session_id,
            "num_results": 10 
        }));
        let memories_response = self.ipc.send(query_request).await;
        let memories_result = memories_response.ok().and_then(|r| r.result);

        let memories: Vec<String> = memories_result
            .as_ref()
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

        let build_request = Request::new(Method::PromptBuild, serde_json::json!({
            "session_id": session_id,
            "project_path": std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string()),
            "user_query": prompt,
            "conversation_history": [],
            "memories": {
                "episodes": memories_result.as_ref().and_then(|r| r.get("episodes")).cloned().unwrap_or(serde_json::json!([])),
                "entities": memories_result.as_ref().and_then(|r| r.get("entities")).cloned().unwrap_or(serde_json::json!([])),
                "facts": memories_result.as_ref().and_then(|r| r.get("facts")).cloned().unwrap_or(serde_json::json!([])),
            },
            "tools": ["bash", "read", "write", "edit", "glob", "grep"],
            "harness_name": "opencode",
            "max_tokens": 4000
        }));
        let built_prompt = self.ipc.send(build_request).await
            .ok()
            .and_then(|r| r.result)
            .and_then(|result| result.get("prompt").and_then(|p| p.as_str()).map(String::from))
            .unwrap_or_default();

        let user_msg = UserMessage::with_context(prompt, &built_prompt);
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

        let full_conversation = format!("User: {}\nAssistant: {}", prompt, content);
        let add_request = Request::new(Method::MemoryAddEpisode, serde_json::json!({
            "name": "conversation",
            "content": full_conversation,
            "source_description": "user conversation",
            "session_id": session_id.clone()
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