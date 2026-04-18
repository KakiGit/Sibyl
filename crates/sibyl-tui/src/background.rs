use sibyl_harness::Harness;
use sibyl_ipc::client::IpcClient;
use sibyl_ipc::{Method, Request};
use sibyl_opencode::client::OpenCodeClient;
use sibyl_opencode::types::OpenCodeEvent;
use sibyl_opencode::types::UserMessage;
use std::sync::Arc;
use tokio::sync::mpsc::{channel, Receiver, Sender};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub enum UiEvent {
    SessionCreated {
        session_id: String,
    },
    SessionIdle {
        session_id: String,
    },
    SessionCanceled {
        session_id: String,
    },
    SessionBusy {
        session_id: String,
    },
    MessageCreated {
        session_id: String,
        message_id: String,
        role: String,
    },
    MessagePartDelta {
        session_id: String,
        message_id: String,
        part_id: String,
        delta: String,
    },
    MessagePartComplete {
        session_id: String,
        message_id: String,
        part_id: String,
        content: String,
    },
    MessageComplete {
        session_id: String,
        message_id: String,
    },
    ToolUse {
        session_id: String,
        tool: String,
        status: String,
    },
    Error {
        session_id: String,
        message: String,
    },
    MemoriesRetrieved {
        memories: Vec<String>,
    },
}

#[derive(Debug, Clone)]
pub enum BackgroundCommand {
    SendMessage {
        text: String,
        session_id: Option<String>,
    },
    CancelSession {
        session_id: String,
    },
}

type SharedSessionId = Arc<RwLock<Option<String>>>;
type SharedTaskState = Arc<RwLock<TaskState>>;

#[derive(Debug, Clone, Default)]
struct TaskState {
    last_user_message: Option<String>,
    last_assistant_response: Option<String>,
}

async fn handle_command_spawned(
    opencode: OpenCodeClient,
    ipc: IpcClient,
    tx: Sender<UiEvent>,
    cmd: BackgroundCommand,
    shared_session_id: SharedSessionId,
    shared_task_state: SharedTaskState,
    connect_tx: Sender<bool>,
) {
    match cmd {
        BackgroundCommand::SendMessage { text, session_id } => {
            tracing::info!("Spawned task sending message: {}", text);

            {
                let mut state_guard = shared_task_state.write().await;
                state_guard.last_user_message = Some(text.clone());
                state_guard.last_assistant_response = None;
            }

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
                            let _ = tx
                                .send(UiEvent::SessionCreated {
                                    session_id: info.id.clone(),
                                })
                                .await;
                            let _ = connect_tx.send(true).await;
                            info.id
                        }
                        Err(e) => {
                            tracing::error!("Failed to create session: {:?}", e);
                            let _ = tx
                                .send(UiEvent::Error {
                                    session_id: "unknown".to_string(),
                                    message: "Failed to create session".to_string(),
                                })
                                .await;
                            return;
                        }
                    }
                }
            };

            tracing::info!("Retrieving memories for session {}", sid);
            let memories_request = Request::new(
                Method::MemoryQuery,
                serde_json::json!({
                    "query": text,
                    "session_id": sid,
                    "num_results": 10
                }),
            );
            let memories_result = ipc.send(memories_request).await.ok().and_then(|r| r.result);

            let memories: Vec<String> = memories_result
                .as_ref()
                .and_then(|r| r.get("episodes").and_then(|e| e.as_array()))
                .map(|episodes| {
                    episodes
                        .iter()
                        .filter_map(|e| e.get("content").and_then(|c| c.as_str()).map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            if !memories.is_empty() {
                tracing::info!("Found {} memories, sending to UI", memories.len());
                let _ = tx
                    .send(UiEvent::MemoriesRetrieved {
                        memories: memories.clone(),
                    })
                    .await;
            }

            tracing::info!("Building prompt for session {}", sid);
            let prompt_request = Request::new(
                Method::PromptBuild,
                serde_json::json!({
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
                }),
            );
            let prompt = ipc
                .send(prompt_request)
                .await
                .ok()
                .and_then(|r| r.result)
                .and_then(|result| {
                    result
                        .get("prompt")
                        .and_then(|p| p.as_str())
                        .map(String::from)
                })
                .unwrap_or_default();

            let user_msg = UserMessage::with_context(&text, &prompt);
            tracing::info!("Sending message to OpenCode session {}", sid);
            if let Err(e) = opencode.send_user_message_async(&sid, &user_msg).await {
                tracing::error!("Failed to send message: {:?}", e);
                let _ = tx
                    .send(UiEvent::Error {
                        session_id: sid,
                        message: "Failed to send message".to_string(),
                    })
                    .await;
            }
            tracing::info!("Message sent to OpenCode");
        }
        BackgroundCommand::CancelSession { session_id } => {
            tracing::info!("Canceling session {}", session_id);
            if let Err(e) = opencode.abort_session(&session_id).await {
                tracing::error!("Failed to cancel session: {:?}", e);
                let _ = tx
                    .send(UiEvent::Error {
                        session_id,
                        message: "Failed to cancel session".to_string(),
                    })
                    .await;
            } else {
                tracing::info!("Session canceled successfully");
                let _ = tx.send(UiEvent::SessionCanceled { session_id }).await;
            }
        }
    }
}

pub struct BackgroundTask {
    opencode: OpenCodeClient,
    ipc: IpcClient,
    tx: Sender<UiEvent>,
    rx: Receiver<BackgroundCommand>,
    shared_session_id: SharedSessionId,
    shared_task_state: SharedTaskState,
    session_busy: bool,
    current_message_id: Option<String>,
    streaming_text: String,
    sse_connected: bool,
}

impl BackgroundTask {
    pub fn new(
        opencode: OpenCodeClient,
        ipc: IpcClient,
        tx: Sender<UiEvent>,
        rx: Receiver<BackgroundCommand>,
    ) -> Self {
        Self {
            opencode,
            ipc,
            tx,
            rx,
            shared_session_id: Arc::new(RwLock::new(None)),
            shared_task_state: Arc::new(RwLock::new(TaskState::default())),
            session_busy: false,
            current_message_id: None,
            streaming_text: String::new(),
            sse_connected: false,
        }
    }

    pub async fn run(mut self) {
        tracing::info!("Background task started, SSE not connected yet");

        let (sse_tx, mut sse_rx) = tokio::sync::mpsc::channel::<OpenCodeEvent>(100);
        let (connect_tx, mut connect_rx) = tokio::sync::mpsc::channel::<bool>(1);

        loop {
            tokio::select! {
                biased;

                _ = connect_rx.recv() => {
                    if !self.sse_connected {
                        tracing::info!("Session created, connecting to SSE");
                        if self.opencode.connect_events().await.is_ok() {
                            let mut guard = self.opencode.event_stream.write().await;
                            if let Some(stream) = guard.take() {
                                self.sse_connected = true;
                                tracing::info!("SSE connected, starting polling task");
                                let tx = sse_tx.clone();
                                let session_id = self.shared_session_id.clone();
                                tokio::spawn(async move {
                                    use futures::StreamExt;
                                    let mut stream = stream;
                                    tracing::info!("SSE polling task started");
                                    loop {
                                        match stream.next().await {
                                            Some(Ok(event)) => {
                                                let should_send = match &event {
                                                    OpenCodeEvent::ServerConnected { .. } => true,
                                                    OpenCodeEvent::ServerHeartbeat { .. } => true,
                                                    OpenCodeEvent::SessionCreated { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::SessionStatus { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::SessionIdle { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::SessionUpdated { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::SessionDiff { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::SessionError { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::MessageUpdated { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::MessagePartUpdated { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::MessagePartDelta { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    OpenCodeEvent::PermissionAsked { properties } => {
                                                        let guard = session_id.read().await;
                                                        guard.as_ref() == Some(&properties.session_id)
                                                    }
                                                    _ => false,
                                                };
                                                if should_send {
                                                    if tx.send(event).await.is_err() {
                                                        tracing::error!("SSE channel closed, stopping polling");
                                                        break;
                                                    }
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
                        }
                    }
                }

                event = sse_rx.recv() => {
                    match event {
                        Some(event) => {
                            tracing::info!("SSE event (filtered): {:?}", event);
                            self.handle_event(event).await;
                        }
                        None => {
                            tracing::warn!("SSE channel closed");
                            self.sse_connected = false;
                        }
                    }
                }

                cmd = self.rx.recv() => {
                    match cmd {
                        Some(c) => {
                            tracing::info!("Command received: {:?}", c);
                            let opencode = self.opencode.clone();
                            let ipc = self.ipc.clone();
                            let tx = self.tx.clone();
                            let shared_session_id = self.shared_session_id.clone();
                            let shared_task_state = self.shared_task_state.clone();
                            let connect_tx = connect_tx.clone();

                            tokio::spawn(async move {
                                handle_command_spawned(opencode, ipc, tx, c, shared_session_id, shared_task_state, connect_tx).await;
                            });
                        }
                        None => {
                            tracing::info!("Command channel closed, exiting");
                            break;
                        }
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
                let _ = self
                    .tx
                    .send(UiEvent::MessageCreated {
                        session_id: "system".to_string(),
                        message_id: "sse-connected".to_string(),
                        role: "system".to_string(),
                    })
                    .await;
            }
            OpenCodeEvent::SessionCreated { properties } => {
                tracing::info!("SessionCreated SSE: session_id={}", properties.session_id);
                {
                    let mut guard = self.shared_session_id.write().await;
                    *guard = Some(properties.session_id.clone());
                }
                let _ = self
                    .tx
                    .send(UiEvent::SessionCreated {
                        session_id: properties.session_id,
                    })
                    .await;
            }
            OpenCodeEvent::ServerHeartbeat { .. } => {
                tracing::debug!("SSE heartbeat received");
            }
            OpenCodeEvent::SessionStatus { properties } => {
                tracing::info!(
                    "SessionStatus: session_id={}, status={:?}",
                    properties.session_id,
                    properties.status
                );
                let was_busy = self.session_busy;
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
                    let _ = self
                        .tx
                        .send(UiEvent::SessionBusy {
                            session_id: properties.session_id,
                        })
                        .await;
                } else if was_busy {
                    let _ = self
                        .tx
                        .send(UiEvent::SessionIdle {
                            session_id: properties.session_id,
                        })
                        .await;
                }
            }
            OpenCodeEvent::SessionIdle { properties } => {
                tracing::info!("SessionIdle: session_id={}", properties.session_id);

                let (user_msg, assistant_msg, session_id) = {
                    let state_guard = self.shared_task_state.read().await;
                    (
                        state_guard.last_user_message.clone(),
                        state_guard.last_assistant_response.clone(),
                        properties.session_id.clone(),
                    )
                };

                if let (Some(user), Some(assistant)) = (user_msg, assistant_msg) {
                    tracing::info!("Storing memory for conversation");
                    self.store_memory(&session_id, &user, &assistant).await;
                }
            }
            OpenCodeEvent::MessageUpdated { properties } => {
                let role_str = match properties.info.role {
                    sibyl_opencode::types::MessageRole::User => "user",
                    sibyl_opencode::types::MessageRole::Assistant => "assistant",
                    sibyl_opencode::types::MessageRole::System => "system",
                };
                tracing::info!("MessageUpdated: role={}", role_str);
                let _ = self
                    .tx
                    .send(UiEvent::MessageCreated {
                        session_id: properties.session_id.clone(),
                        message_id: properties.info.id.clone(),
                        role: role_str.to_string(),
                    })
                    .await;
                if role_str == "assistant" {
                    self.current_message_id = Some(properties.info.id.clone());
                    if properties.info.time.completed.is_some() {
                        let _ = self
                            .tx
                            .send(UiEvent::MessageComplete {
                                session_id: properties.session_id,
                                message_id: properties.info.id,
                            })
                            .await;
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
                            {
                                let mut state_guard = self.shared_task_state.write().await;
                                state_guard.last_assistant_response = Some(text.clone());
                            }
                            let _ = self
                                .tx
                                .send(UiEvent::MessagePartComplete {
                                    session_id: properties.session_id,
                                    message_id: self.current_message_id.clone().unwrap_or_default(),
                                    part_id: id,
                                    content: text,
                                })
                                .await;
                        }
                    }
                    sibyl_opencode::types::Part::Tool {
                        id: _, tool, state, ..
                    } => {
                        let status = state
                            .map(|s| s.status)
                            .unwrap_or_else(|| "unknown".to_string());
                        tracing::info!("Tool part: tool={}, status={}", tool, status);
                        let _ = self
                            .tx
                            .send(UiEvent::ToolUse {
                                session_id: properties.session_id,
                                tool,
                                status,
                            })
                            .await;
                    }
                    sibyl_opencode::types::Part::StepFinish { .. } => {
                        tracing::info!("Step finish received, completing stream");
                        let content = self.streaming_text.clone();
                        self.streaming_text.clear();
                        if !content.is_empty() {
                            {
                                let mut state_guard = self.shared_task_state.write().await;
                                state_guard.last_assistant_response = Some(content.clone());
                            }
                            let _ = self
                                .tx
                                .send(UiEvent::MessagePartComplete {
                                    session_id: properties.session_id,
                                    message_id: self.current_message_id.clone().unwrap_or_default(),
                                    part_id: "stream".to_string(),
                                    content,
                                })
                                .await;
                        }
                    }
                    other => {
                        tracing::debug!("Other part type: {:?}", other);
                    }
                }
            }
            OpenCodeEvent::MessagePartDelta { properties } => {
                tracing::debug!("MessagePartDelta: delta={}", properties.delta);
                self.streaming_text.push_str(&properties.delta);
                let _ = self
                    .tx
                    .send(UiEvent::MessagePartDelta {
                        session_id: properties.session_id,
                        message_id: properties.message_id,
                        part_id: properties.part_id,
                        delta: properties.delta,
                    })
                    .await;
            }
            OpenCodeEvent::SessionError { properties } => {
                if properties.error.name == "MessageAbortedError" {
                    tracing::info!("Session aborted successfully");
                    let _ = self
                        .tx
                        .send(UiEvent::SessionCanceled {
                            session_id: properties.session_id,
                        })
                        .await;
                    self.session_busy = false;
                    return;
                }
                tracing::error!("SessionError: {:?}", properties.error);
                let msg = properties
                    .error
                    .message
                    .clone()
                    .unwrap_or_else(|| properties.error.name.clone());
                let _ = self
                    .tx
                    .send(UiEvent::Error {
                        session_id: properties.session_id,
                        message: msg,
                    })
                    .await;
            }
            OpenCodeEvent::PermissionAsked { properties } => {
                tracing::info!("PermissionAsked: {}", properties.permission);
                let _ = self
                    .tx
                    .send(UiEvent::Error {
                        session_id: properties.session_id,
                        message: format!("Permission requested: {}", properties.permission),
                    })
                    .await;
            }
            other => {
                tracing::debug!("Unhandled event: {:?}", other);
            }
        }
    }

    async fn store_memory(&self, session_id: &str, user_text: &str, assistant_text: &str) {
        let full_conversation = format!("User: {}\nAssistant: {}", user_text, assistant_text);
        let add_request = Request::new(
            Method::MemoryAddEpisode,
            serde_json::json!({
                "name": "conversation",
                "content": full_conversation,
                "source_description": "user conversation",
                "session_id": session_id
            }),
        );
        if let Err(e) = self.ipc.send(add_request).await {
            tracing::error!("Failed to store memory: {:?}", e);
        } else {
            tracing::info!("Memory stored successfully");
        }
    }
}

pub fn create_channels() -> (
    Sender<BackgroundCommand>,
    Receiver<BackgroundCommand>,
    Sender<UiEvent>,
    Receiver<UiEvent>,
) {
    let (bg_tx, bg_rx) = channel::<BackgroundCommand>(32);
    let (ui_tx, ui_rx) = channel::<UiEvent>(32);
    (bg_tx, bg_rx, ui_tx, ui_rx)
}

pub fn spawn_background_task(
    opencode: OpenCodeClient,
    ipc: IpcClient,
    bg_rx: Receiver<BackgroundCommand>,
    ui_tx: Sender<UiEvent>,
) -> tokio::task::JoinHandle<()> {
    let task = BackgroundTask::new(opencode, ipc, ui_tx, bg_rx);
    tokio::spawn(async move {
        task.run().await
    })
}
