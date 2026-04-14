use super::types::{Session, SessionId, SessionState};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct SessionStateTracker {
    session_id: SessionId,
    state: Arc<RwLock<SessionState>>,
}

impl SessionStateTracker {
    pub fn new(session: &Session) -> Self {
        Self {
            session_id: session.id.clone(),
            state: Arc::new(RwLock::new(session.state)),
        }
    }

    pub async fn set(&self, state: SessionState) {
        *self.state.write().await = state;
    }

    pub async fn get(&self) -> SessionState {
        *self.state.read().await
    }

    pub fn session_id(&self) -> &SessionId {
        &self.session_id
    }
}

impl Clone for SessionStateTracker {
    fn clone(&self) -> Self {
        Self {
            session_id: self.session_id.clone(),
            state: self.state.clone(),
        }
    }
}