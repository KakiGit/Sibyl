use crate::session::{Session, SessionEvent, SessionId, SessionState};
use crate::Result;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

use super::persistence::SessionStorage;

pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<SessionId, Session>>>,
    active_session: Arc<RwLock<Option<SessionId>>>,
    storage: SessionStorage,
}

impl SessionManager {
    pub fn new(storage: SessionStorage) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            active_session: Arc::new(RwLock::new(None)),
            storage,
        }
    }

    pub async fn create_session(&self, project_path: Option<PathBuf>) -> Result<Session> {
        let session = Session::new(project_path.clone());
        
        self.storage.append_event(
            &session.id,
            &SessionEvent::SessionCreated {
                id: session.id.clone(),
                timestamp: session.created_at,
                harness: session.harness.clone(),
            },
        ).await?;
        
        self.sessions.write().await.insert(session.id.clone(), session.clone());
        
        info!("Created session: {}", session.id.as_str());
        Ok(session)
    }

    pub async fn get_session(&self, id: &SessionId) -> Option<Session> {
        self.sessions.read().await.get(id).cloned()
    }

    pub async fn set_active(&self, id: &SessionId) -> Result<()> {
        let mut active = self.active_session.write().await;
        
        if self.sessions.read().await.contains_key(id) {
            *active = Some(id.clone());
            debug!("Set active session: {}", id.as_str());
        } else {
            return Err(crate::Error::SessionNotFound(id.as_str().to_string()));
        }
        
        Ok(())
    }

    pub async fn get_active(&self) -> Option<Session> {
        let active = self.active_session.read().await.clone();
        if let Some(id) = active {
            self.get_session(&id).await
        } else {
            None
        }
    }

    pub async fn update_state(&self, id: &SessionId, state: SessionState) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        
        if let Some(session) = sessions.get_mut(id) {
            session.set_state(state);
            
            self.storage.append_event(
                id,
                &SessionEvent::StateChanged {
                    state,
                    session: id.clone(),
                    timestamp: chrono::Utc::now(),
                },
            ).await?;
            
            debug!("Updated session {} state to {:?}", id.as_str(), state);
        } else {
            return Err(crate::Error::SessionNotFound(id.as_str().to_string()));
        }
        
        Ok(())
    }

    pub async fn add_message(&self, id: &SessionId, event: SessionEvent) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        
        if let Some(session) = sessions.get_mut(id) {
            if let SessionEvent::Message { role, content, .. } = &event {
                use super::types::{Message, Role};
                let msg = match role {
                    Role::User => Message::user(content),
                    Role::Assistant => Message::assistant(content),
                    Role::System => Message::system(content),
                };
                session.messages.push(msg);
            }
            
            self.storage.append_event(id, &event).await?;
        } else {
            return Err(crate::Error::SessionNotFound(id.as_str().to_string()));
        }
        
        Ok(())
    }

    pub async fn list_sessions(&self) -> Vec<Session> {
        self.sessions.read().await.values().cloned().collect()
    }

    pub async fn remove_session(&self, id: &SessionId) -> Result<()> {
        self.sessions.write().await.remove(id);
        self.storage.delete_session(id).await?;
        
        let mut active = self.active_session.write().await;
        if active.as_ref() == Some(id) {
            *active = None;
        }
        
        info!("Removed session: {}", id.as_str());
        Ok(())
    }

    pub async fn load_from_storage(&self) -> Result<()> {
        let session_ids = self.storage.list_sessions().await?;
        
        for id in session_ids {
            let events = self.storage.read_events(&id).await?;
            let mut session = Session::new(None);
            session.id = id.clone();
            
            for event in events {
                match event {
                    SessionEvent::SessionCreated { harness, .. } => {
                        session.harness = harness;
                    }
                    SessionEvent::Message { role, content, .. } => {
                        use super::types::{Message, Role};
                        let msg = match role {
                            Role::User => Message::user(content),
                            Role::Assistant => Message::assistant(content),
                            Role::System => Message::system(content),
                        };
                        session.messages.push(msg);
                    }
                    SessionEvent::StateChanged { state, .. } => {
                        session.state = state;
                    }
                    _ => {}
                }
            }
            
            self.sessions.write().await.insert(id, session);
        }
        
        Ok(())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new(SessionStorage::default())
    }
}