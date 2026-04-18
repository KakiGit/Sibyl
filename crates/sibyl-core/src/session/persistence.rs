use crate::session::{SessionEvent, SessionId};
use crate::Result;
use std::path::PathBuf;
use std::io::{BufRead, BufReader, Write};
use tokio::fs;
use tracing::{debug, warn};

pub struct SessionStorage {
    base_path: PathBuf,
}

impl SessionStorage {
    pub fn new(base_path: impl Into<PathBuf>) -> Self {
        Self {
            base_path: base_path.into(),
        }
    }

    pub fn session_file(&self, session_id: &SessionId) -> PathBuf {
        self.base_path.join(format!("{}.jsonl", session_id.as_str()))
    }

    pub async fn append_event(&self, session_id: &SessionId, event: &SessionEvent) -> Result<()> {
        let file_path = self.session_file(session_id);
        
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)?;
        
        let json = serde_json::to_string(event)?;
        writeln!(file, "{}", json)?;
        
        debug!("Appended event to session {}: {:?}", session_id.as_str(), event);
        Ok(())
    }

    pub async fn read_events(&self, session_id: &SessionId) -> Result<Vec<SessionEvent>> {
        let file_path = self.session_file(session_id);
        
        if !file_path.exists() {
            return Ok(Vec::new());
        }
        
        let file = std::fs::File::open(&file_path)?;
        let reader = BufReader::new(file);
        let mut events = Vec::new();
        
        for line in reader.lines() {
            let line = line?;
            if line.is_empty() {
                continue;
            }
            
            match serde_json::from_str::<SessionEvent>(&line) {
                Ok(event) => events.push(event),
                Err(e) => warn!("Failed to parse event: {}", e),
            }
        }
        
        Ok(events)
    }

    pub async fn list_sessions(&self) -> Result<Vec<SessionId>> {
        if !self.base_path.exists() {
            return Ok(Vec::new());
        }
        
        let mut entries = fs::read_dir(&self.base_path).await?;
        let mut sessions = Vec::new();
        
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                if let Some(stem) = path.file_stem() {
                    if let Some(s) = stem.to_str() {
                        if s.starts_with("sess-") {
                            sessions.push(SessionId::from_string(s.to_string()));
                        }
                    }
                }
            }
        }
        
        Ok(sessions)
    }

    pub async fn delete_session(&self, session_id: &SessionId) -> Result<()> {
        let file_path = self.session_file(session_id);
        if file_path.exists() {
            fs::remove_file(&file_path).await?;
        }
        Ok(())
    }
}

impl Default for SessionStorage {
    fn default() -> Self {
        Self::new(".sibyl/sessions")
    }
}