use sibyl_opencode::sse::EventStream;
use sibyl_opencode::types::OpenCodeEvent;
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::types::UserMessage;
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};
use sibyl_harness::Harness;
use tokio::sync::mpsc::{Sender, Receiver, channel};

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

pub struct BackgroundTask {
    events: Option<EventStream>,
    opencode: OpenCodeClient,
    ipc: IpcClient,
    tx: Sender<UiEvent>,
    rx: Receiver<BackgroundCommand>,
    session_id: Option<String>,
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
            session_id: None,
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
        use futures::StreamExt;
        use sibyl_opencode::Error as OpenCodeError;
        let events = self.events.take();
        let mut events_stream: Option<sibyl_opencode::sse::EventStream> = events;
        
        tracing::info!("Background task started, SSE stream: {:?}", events_stream.is_some());
        
        loop {
            tokio::select! {
                cmd = self.rx.recv() => {
                    if let Some(event) = cmd {
                        tracing::debug!("Background received command: {:?}", event);
                        self.handle_command(event).await;
                    }
                }
                event_result = async {
                    match &mut events_stream {
                        Some(ev) => {
                            use futures::StreamExt;
                            ev.next().await
                        }
                        None => std::future::pending::<Option<Result<OpenCodeEvent, OpenCodeError>>>().await,
                    }
                } => {
                    if let Some(Ok(event)) = event_result {
                        tracing::info!("Background received SSE event: {:?}", event);
                        self.handle_event(event).await;
                    }
                }
            }
        }
    }

    async fn handle_command(&mut self, cmd: BackgroundCommand) {
        match cmd {
            BackgroundCommand::SendMessage { text, session_id } => {
                self.send_message(text, session_id).await;
            }
            BackgroundCommand::AbortSession { session_id } => {
                let _ = self.opencode.abort_session(&session_id).await;
                self.session_busy = false;
                let _ = self.tx.send(UiEvent::SessionIdle { session_id });
            }
            BackgroundCommand::CreateSession => {
                if self.session_id.is_none() {
                    let cwd = std::env::current_dir().ok();
                    if let Ok(info) = self.opencode.create_session(cwd.as_deref()).await {
                        self.session_id = Some(info.id.clone());
                        let _ = self.tx.send(UiEvent::SessionIdle { session_id: info.id });
                    }
                }
            }
        }
    }

    async fn handle_event(&mut self, event: OpenCodeEvent) {
        tracing::debug!("Handling WebSocket event: {:?}", event);
        match event {
            OpenCodeEvent::ServerConnected { .. } => {
                tracing::info!("SSE server connected");
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
                let _ = self.tx.send(if self.session_busy {
                    UiEvent::SessionBusy { session_id: properties.session_id }
                } else {
                    UiEvent::SessionIdle { session_id: properties.session_id }
                });
            }
            OpenCodeEvent::SessionIdle { properties } => {
                tracing::info!("SessionIdle: session_id={}", properties.session_id);
                self.session_busy = false;
                self.session_id = Some(properties.session_id.clone());
                let _ = self.tx.send(UiEvent::SessionIdle { session_id: properties.session_id });
            }
            OpenCodeEvent::MessageUpdated { properties } => {
                let role_str = match properties.info.role {
                    sibyl_opencode::types::MessageRole::User => "user",
                    sibyl_opencode::types::MessageRole::Assistant => "assistant",
                    sibyl_opencode::types::MessageRole::System => "system",
                };
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
                match properties.part {
                    sibyl_opencode::types::Part::Text { id, text, time } => {
                        if time.as_ref().and_then(|t| t.end).is_some() {
                            let _ = self.tx.send(UiEvent::MessagePartComplete {
                                session_id: properties.session_id,
                                message_id: self.current_message_id.clone().unwrap_or_default(),
                                part_id: id,
                                content: text,
                            });
                        }
                    }
                    sibyl_opencode::types::Part::Tool { id: _, tool, state } => {
                        let _ = self.tx.send(UiEvent::ToolUse {
                            session_id: properties.session_id,
                            tool,
                            status: state.status,
                        });
                    }
                    _ => {}
                }
            }
            OpenCodeEvent::MessagePartDelta { properties } => {
                self.streaming_text.push_str(&properties.delta);
                let _ = self.tx.send(UiEvent::MessagePartDelta {
                    session_id: properties.session_id,
                    message_id: properties.message_id,
                    part_id: properties.part_id,
                    delta: properties.delta,
                });
            }
            OpenCodeEvent::SessionError { properties } => {
                let msg = properties.error.message.clone()
                    .unwrap_or_else(|| properties.error.name.clone());
                let _ = self.tx.send(UiEvent::Error {
                    session_id: properties.session_id,
                    message: msg,
                });
            }
            OpenCodeEvent::PermissionAsked { properties } => {
                let _ = self.tx.send(UiEvent::Error {
                    session_id: properties.session_id,
                    message: format!("Permission requested: {}", properties.permission),
                });
            }
            _ => {}
        }
    }

    async fn send_message(&mut self, text: String, session_id: Option<String>) {
        tracing::info!("send_message called with text: {}, session_id: {:?}", text, session_id);
        let sid = match session_id.or(self.session_id.clone()) {
            Some(id) => {
                tracing::info!("Using existing session: {}", id);
                id
            }
            None => {
                tracing::info!("Creating new session");
                let cwd = std::env::current_dir().ok();
                match self.opencode.create_session(cwd.as_deref()).await {
                    Ok(info) => {
                        tracing::info!("Created session: {}", info.id);
                        self.session_id = Some(info.id.clone());
                        info.id
                    }
                    Err(e) => {
                        tracing::error!("Failed to create session: {:?}", e);
                        let _ = self.tx.send(UiEvent::Error {
                            session_id: "unknown".to_string(),
                            message: "Failed to create session".to_string(),
                        });
                        return;
                    }
                }
            }
        };

        tracing::info!("Retrieving memories for session {}", sid);
        let memories_result = self.retrieve_memories(&text, &sid).await;
        tracing::info!("Building prompt for session {}", sid);
        let prompt = self.build_prompt(&text, &sid, &memories_result).await;

        let user_msg = UserMessage::with_context(&text, &prompt);
        tracing::info!("Sending message to OpenCode session {}", sid);
        let _ = self.opencode.send_user_message_async(&sid, &user_msg).await;
        
        self.session_busy = true;
        self.streaming_text.clear();
        tracing::info!("Setting session_busy=true, sending SessionBusy event");
        let _ = self.tx.send(UiEvent::SessionBusy { session_id: sid });
    }

    async fn retrieve_memories(&self, text: &str, session_id: &str) -> Option<serde_json::Value> {
        let query_request = Request::new(Method::MemoryQuery, serde_json::json!({ 
            "query": text,
            "session_id": session_id,
            "num_results": 10
        }));
        self.ipc.send(query_request).await.ok().and_then(|r| r.result)
    }

    async fn build_prompt(&self, text: &str, session_id: &str, memories_result: &Option<serde_json::Value>) -> String {
        let build_request = Request::new(Method::PromptBuild, serde_json::json!({
            "session_id": session_id,
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
        self.ipc.send(build_request).await
            .ok()
            .and_then(|r| r.result)
            .and_then(|result| result.get("prompt").and_then(|p| p.as_str()).map(String::from))
            .unwrap_or_default()
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
) -> tokio::task::JoinHandle<()> {
    let task = BackgroundTask::new(opencode, ipc, ui_tx, bg_rx);
    tokio::spawn(async move {
        let mut task = task;
        tracing::info!("Attempting WebSocket connection to OpenCode events");
        match task.opencode.connect_events().await {
            Ok(_) => {
                tracing::info!("WebSocket connected successfully");
                let mut guard = task.opencode.event_stream.write().await;
                if let Some(stream) = guard.take() {
                    task.events = Some(stream);
                    tracing::info!("WebSocket stream attached to background task");
                }
            }
            Err(e) => {
                tracing::error!("WebSocket connection failed: {:?}", e);
            }
        }
        task.run().await
    })
}