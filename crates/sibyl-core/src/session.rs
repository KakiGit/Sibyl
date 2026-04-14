use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(String);

impl SessionId {
    pub fn new() -> Self {
        Self(Uuid::new_v4().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for SessionId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionState {
    Idle,
    Processing,
    Error,
    Closed,
}

#[derive(Debug)]
pub struct Session {
    pub id: SessionId,
    pub state: Arc<RwLock<SessionState>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub project_path: Option<std::path::PathBuf>,
}

impl Session {
    pub fn new(project_path: Option<std::path::PathBuf>) -> Self {
        Self {
            id: SessionId::new(),
            state: Arc::new(RwLock::new(SessionState::Idle)),
            created_at: chrono::Utc::now(),
            project_path,
        }
    }

    pub async fn set_state(&self, state: SessionState) {
        *self.state.write().await = state;
    }

    pub async fn get_state(&self) -> SessionState {
        *self.state.read().await
    }
}