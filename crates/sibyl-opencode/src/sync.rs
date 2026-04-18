use crate::client::OpenCodeClient;
use crate::Result;
use std::collections::HashMap;

pub struct SessionSync {
    client: OpenCodeClient,
    sessions: HashMap<String, String>,
}

impl SessionSync {
    pub fn new(client: OpenCodeClient) -> Self {
        Self {
            client,
            sessions: HashMap::new(),
        }
    }

    pub fn map_session(&mut self, sibyl_id: String, opencode_id: String) {
        self.sessions.insert(sibyl_id, opencode_id);
    }

    pub fn get_opencode_id(&self, sibyl_id: &str) -> Option<&String> {
        self.sessions.get(sibyl_id)
    }

    pub fn remove_session(&mut self, sibyl_id: &str) -> Option<String> {
        self.sessions.remove(sibyl_id)
    }

    pub async fn sync_message_complete(
        &self,
        sibyl_session: &str,
        opencode_session: &str,
    ) -> Result<()> {
        let messages = self.client.get_messages_raw(opencode_session).await?;

        let episode_content = self.format_episode(&messages);

        tracing::info!(
            "Syncing episode for session {}: {} bytes",
            sibyl_session,
            episode_content.len()
        );

        Ok(())
    }

    fn format_episode(&self, messages: &[serde_json::Value]) -> String {
        messages
            .iter()
            .filter_map(|m| {
                let role = m.get("role")?.as_str()?;
                let content = m.get("content")?.as_str()?;
                Some(format!("{}: {}", role, content))
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    }

    pub async fn on_fork(&mut self, old_sibyl_id: &str, new_sibyl_id: String) -> Result<String> {
        let opencode_id = self
            .sessions
            .get(old_sibyl_id)
            .ok_or_else(|| crate::Error::ConnectionError("Session not found".to_string()))?;

        let fork_response = self.client.fork_session(opencode_id).await?;
        self.sessions.insert(new_sibyl_id, fork_response.id.clone());

        Ok(fork_response.id)
    }

    pub async fn on_abort(&self, sibyl_session: &str) -> Result<()> {
        let opencode_id = self
            .sessions
            .get(sibyl_session)
            .ok_or_else(|| crate::Error::ConnectionError("Session not found".to_string()))?;

        self.client.abort_session(opencode_id).await
    }
}
