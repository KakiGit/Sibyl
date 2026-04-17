use sibyl_opencode::sse::EventStream;
use sibyl_opencode::types::OpenCodeEvent;
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::types::UserMessage;
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};
use sibyl_harness::Harness;
use tokio::sync::mpsc::{Sender, Receiver, channel};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub enum UiEvent {
    SessionIdle { session_id: String },
    SessionBusy { session_id: String },
    MessageCreated { session_id: String, message_id: String, role: String },
    MessagePartDelta { session_id: String, message_id: String, part_id: String, delta: String },
    MessagePartComplete { session_id: String, message_id: String, part_id: String, content: String },
    MessageComplete { session_id: String, message_id: String },
    ToolUse { session_id: String, tool: String, status: String },
    Error { session_id: String, message: String },
    MemoryRetrieved { memories: Vec<String> },
    PromptBuilt { prompt: String },
}

#[derive(Debug, Clone)]
pub enum BackgroundCommand {
    SendMessage { text: String, session_id: Option<String> },
    AbortSession { session_id: String },
    CreateSession,
}

type SharedSessionId = Arc<RwLock<Option<String>>>;

async fn handle_command_spawned(
    opencode: OpenCodeClient,
    ipc: IpcClient,
    tx: Sender<UiEvent>,
    cmd: BackgroundCommand,
    shared_session_id: SharedSessionId,
) {
    match cmd {
        BackgroundCommand::SendMessage { text, session_id } => {
            tracing::info!("Spawned task sending message: {}", text);
            
            let sid = {
                let guard = shared_session_id.read().await;
                session_id.or(guard.clone())
            };
            
            let sid = match sid {
                Some(id) => id,
                None => {
                    let cwd = std::env::current_dir().ok();
                    match opencode.create_session(cwd.as_deref()).await {
                        Ok(info) => {
                            let mut guard = shared_session_id.write().await;
                            *guard = Some(info.id.clone());
                            info.id
                        }
                        Err(e) => {
                            tracing::error!("Failed to create session: {:?}", e);
                            let _ = tx.send(UiEvent::Error {
                                session_id: "unknown".to_string(),
                                message: "Failed to create session".to_string(),
                            });
                            return;
                        }
                    }
                }
            };

            tracing::info!("Retrieving memories for session {}", sid);
            let memories_request = Request::new(Method::MemoryQuery, serde_json::json!({ 
                "query": text,
                "session_id": sid,
                "num_results": 10
            }));
            let memories_result = ipc.send(memories_request).await.ok().and_then(|r| r.result);
            
            tracing::info!("Building prompt for session {}", sid);
            let prompt_request = Request::new(Method::PromptBuild, serde_json::json!({
                "session_id": sid,
                "project_path": std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string()),
                "user_query": text,
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
            let prompt = ipc.send(prompt_request).await
                .ok()
                .and_then(|r| r.result)
                .and_then(|result| result.get("prompt").and_then(|p| p.as_str()).map(String::from))
                .unwrap_or_default();

            let user_msg = UserMessage::with_context(&text, &prompt);
            tracing::info!("Sending message to OpenCode session {}", sid);
            if let Err(e) = opencode.send_user_message_async(&sid, &user_msg).await {
                tracing::error!("Failed to send message: {:?}", e);
                let _ = tx.send(UiEvent::Error {
                    session_id: sid,
                    message: "Failed to send message".to_string(),
                });
            }
            tracing::info!("Message sent to OpenCode");
        }
        BackgroundCommand::AbortSession { session_id } => {
            let _ = opencode.abort_session(&session_id).await;
            let _ = tx.send(UiEvent::SessionIdle { session_id });
        }
        BackgroundCommand::CreateSession => {
            let cwd = std::env::current_dir().ok();
            if let Ok(info) = opencode.create_session(cwd.as_deref()).await {
                let mut guard = shared_session_id.write().await;
                *guard = Some(info.id.clone());
                let _ = tx.send(UiEvent::SessionIdle { session_id: info.id });
            }
        }
    }
}

pub struct BackgroundTask {
    events: Option<EventStream>,
    opencode: OpenCodeClient,
    ipc: IpcClient,
    tx: Sender<UiEvent>,
    rx: Receiver<BackgroundCommand>,
    shared_session_id: SharedSessionId,
    session_busy: bool,
    current_message_id: Option<String>,
    current_part_id: Option<String>,
    streaming_text: String,
}

impl BackgroundTask {
    pub fn new(
        opencode: OpenCodeClient,
        ipc: IpcClient,
        tx: Sender<UiEvent>,
        rx: Receiver<BackgroundCommand>,
    ) -> Self {
        Self {
            events: None,
            opencode,
            ipc,
            tx,
            rx,
            shared_session_id: Arc::new(RwLock::new(None)),
            session_busy: false,
            current_message_id: None,
            current_part_id: None,
            streaming_text: String::new(),
        }
    }

    pub fn with_events(mut self, events: EventStream) -> Self {
        self.events = Some(events);
        self
    }

    pub async fn run(mut self) {
        tracing::info!("Background task started, SSE stream: {:?}", self.events.is_some());
        
        let (sse_tx, mut sse_rx) = tokio::sync::mpsc::channel::<OpenCodeEvent>(100);
        
        if let Some(stream) = self.events.take() {
            tokio::spawn(async move {
                use futures::StreamExt;
                let mut stream = stream;
                tracing::info!("SSE polling task started");
                loop {
                    match stream.next().await {
                        Some(Ok(event)) => {
                            if sse_tx.send(event).await.is_err() {
                                tracing::error!("SSE channel closed, stopping polling");
                                break;
                            }
                        }
                        Some(Err(e)) => {
                            tracing::error!("SSE error: {:?}", e);
                        }
                        None => {
                            tracing::info!("SSE stream ended");
                            break;
                        }
                    }
                }
            });
        }
        
        loop {
            tracing::debug!("Background loop tick");
            
            tokio::select! {
                biased;
                event = sse_rx.recv() => {
                    if let Some(event) = event {
                        tracing::info!("SSE event: {:?}", event);
                        self.handle_event(event).await;
                    }
                }
                cmd = self.rx.recv() => {
                    if let Some(c) = cmd {
                        tracing::info!("Command received: {:?}", c);
                        let opencode = self.opencode.clone();
                        let ipc = self.ipc.clone();
                        let tx = self.tx.clone();
                        let shared_session_id = self.shared_session_id.clone();
                        
                        tokio::spawn(async move {
                            handle_command_spawned(opencode, ipc, tx, c, shared_session_id).await;
                        });
                    }
                }
            }
        }
    }

    async fn handle_event(&mut self, event: OpenCodeEvent) {
        tracing::info!("handle_event: {:?}", event);
        match event {
            OpenCodeEvent::ServerConnected { .. } => {
                tracing::info!("SSE server connected");
                let _ = self.tx.send(UiEvent::MessageCreated {
                    session_id: "system".to_string(),
                    message_id: "sse-connected".to_string(),
                    role: "system".to_string(),
                });
            }
            OpenCodeEvent::SessionCreated { properties } => {
                tracing::info!("SessionCreated: session_id={}", properties.session_id);
                {
                    let mut guard = self.shared_session_id.write().await;
                    *guard = Some(properties.session_id.clone());
                }
                self.session_busy = false;
                let _ = self.tx.send(UiEvent::SessionIdle { session_id: properties.session_id });
            }
            OpenCodeEvent::ServerHeartbeat { .. } => {
                tracing::debug!("SSE heartbeat received");
            }
            OpenCodeEvent::SessionStatus { properties } => {
                tracing::info!("SessionStatus: session_id={}, status={:?}", properties.session_id, properties.status);
                self.session_busy = match properties.status {
                    sibyl_opencode::types::SessionStatus::Busy => true,
                    sibyl_opencode::types::SessionStatus::Idle => false,
                    sibyl_opencode::types::SessionStatus::Retry { .. } => true,
                };
                {
                    let mut guard = self.shared_session_id.write().await;
                    *guard = Some(properties.session_id.clone());
                }
                if self.session_busy {
                    let _ = self.tx.send(UiEvent::SessionBusy { session_id: properties.session_id });
                }
            }
            OpenCodeEvent::SessionIdle { properties } => {
                tracing::info!("SessionIdle: session_id={}", properties.session_id);
                self.session_busy = false;
                {
                    let mut guard = self.shared_session_id.write().await;
                    *guard = Some(properties.session_id.clone());
                }
                let _ = self.tx.send(UiEvent::SessionIdle { session_id: properties.session_id });
            }
            OpenCodeEvent::MessageUpdated { properties } => {
                let role_str = match properties.info.role {
                    sibyl_opencode::types::MessageRole::User => "user",
                    sibyl_opencode::types::MessageRole::Assistant => "assistant",
                    sibyl_opencode::types::MessageRole::System => "system",
                };
                tracing::info!("MessageUpdated: role={}", role_str);
                let _ = self.tx.send(UiEvent::MessageCreated {
                    session_id: properties.session_id.clone(),
                    message_id: properties.info.id.clone(),
                    role: role_str.to_string(),
                });
                if role_str == "assistant" {
                    self.current_message_id = Some(properties.info.id.clone());
                    if properties.info.time.completed.is_some() {
                        let _ = self.tx.send(UiEvent::MessageComplete {
                            session_id: properties.session_id,
                            message_id: properties.info.id,
                        });
                    }
                }
            }
            OpenCodeEvent::MessagePartUpdated { properties, .. } => {
                tracing::info!("MessagePartUpdated: {:?}", properties.part);
                match properties.part {
                    sibyl_opencode::types::Part::Text { id, text, time, .. } => {
                        tracing::info!("Text part: id={}, text={}, time={:?}", id, text, time);
                        if time.as_ref().and_then(|t| t.end).is_some() {
                            tracing::info!("Text part complete: {}", text);
                            let _ = self.tx.send(UiEvent::MessagePartComplete {
                                session_id: properties.session_id,
                                message_id: self.current_message_id.clone().unwrap_or_default(),
                                part_id: id,
                                content: text,
                            });
                        }
                    }
                    sibyl_opencode::types::Part::Tool { id: _, tool, state, .. } => {
                        let status = state.map(|s| s.status).unwrap_or_else(|| "unknown".to_string());
                        tracing::info!("Tool part: tool={}, status={}", tool, status);
                        let _ = self.tx.send(UiEvent::ToolUse {
                            session_id: properties.session_id,
                            tool,
                            status,
                        });
                    }
                    other => {
                        tracing::debug!("Other part type: {:?}", other);
                    }
                }
            }
            OpenCodeEvent::MessagePartDelta { properties } => {
                tracing::debug!("MessagePartDelta: delta={}", properties.delta);
                self.streaming_text.push_str(&properties.delta);
                let _ = self.tx.send(UiEvent::MessagePartDelta {
                    session_id: properties.session_id,
                    message_id: properties.message_id,
                    part_id: properties.part_id,
                    delta: properties.delta,
                });
            }
            OpenCodeEvent::SessionError { properties } => {
                tracing::error!("SessionError: {:?}", properties.error);
                let msg = properties.error.message.clone()
                    .unwrap_or_else(|| properties.error.name.clone());
                let _ = self.tx.send(UiEvent::Error {
                    session_id: properties.session_id,
                    message: msg,
                });
            }
            OpenCodeEvent::PermissionAsked { properties } => {
                tracing::info!("PermissionAsked: {}", properties.permission);
                let _ = self.tx.send(UiEvent::Error {
                    session_id: properties.session_id,
                    message: format!("Permission requested: {}", properties.permission),
                });
            }
            other => {
                tracing::debug!("Unhandled event: {:?}", other);
            }
        }
    }

    #[allow(dead_code)]
    async fn store_memory(&self, session_id: &str, user_text: &str, assistant_text: &str) {
        let full_conversation = format!("User: {}\nAssistant: {}", user_text, assistant_text);
        let add_request = Request::new(Method::MemoryAddEpisode, serde_json::json!({
            "name": "conversation",
            "content": full_conversation,
            "source_description": "user conversation",
            "session_id": session_id
        }));
        let _ = self.ipc.send(add_request).await;
    }
}

pub fn create_channels() -> (Sender<BackgroundCommand>, Receiver<BackgroundCommand>, Sender<UiEvent>, Receiver<UiEvent>) {
    let (bg_tx, bg_rx) = channel::<BackgroundCommand>(32);
    let (ui_tx, ui_rx) = channel::<UiEvent>(32);
    (bg_tx, bg_rx, ui_tx, ui_rx)
}

pub async fn spawn_background_task(
    opencode: OpenCodeClient,
    ipc: IpcClient,
    bg_rx: Receiver<BackgroundCommand>,
    ui_tx: Sender<UiEvent>,
) -> tokio::task::JoinHandle<()> {
    let task = BackgroundTask::new(opencode, ipc, ui_tx, bg_rx);
    tokio::spawn(task.run())
}

pub async fn spawn_background_task_with_events(
    opencode: OpenCodeClient,
    ipc: IpcClient,
    bg_rx: Receiver<BackgroundCommand>,
    ui_tx: Sender<UiEvent>,
    ready_tx: tokio::sync::oneshot::Sender<bool>,
) -> tokio::task::JoinHandle<()> {
    let task = BackgroundTask::new(opencode, ipc, ui_tx, bg_rx);
    tokio::spawn(async move {
        let mut task = task;
        tracing::info!("Attempting SSE connection to OpenCode events");
        let connected = match task.opencode.connect_events().await {
            Ok(_) => {
                tracing::info!("SSE connected successfully");
                let mut guard = task.opencode.event_stream.write().await;
                if let Some(stream) = guard.take() {
                    task.events = Some(stream);
                    tracing::info!("SSE stream attached to background task");
                    true
                } else {
                    tracing::error!("SSE stream was None after connection");
                    false
                }
            }
            Err(e) => {
                tracing::error!("SSE connection failed: {:?}", e);
                false
            }
        };
        let _ = ready_tx.send(connected);
        task.run().await
    })
}