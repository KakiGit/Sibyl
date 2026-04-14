use crate::{Result, Session};
use sibyl_harness::Harness;
use sibyl_ipc::client::IpcClient;
use sibyl_plugin::PluginManager;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct Orchestrator {
    sessions: Arc<RwLock<Vec<Session>>>,
    harness: Arc<dyn Harness>,
    ipc_client: Option<IpcClient>,
    plugin_manager: PluginManager,
}

impl Orchestrator {
    pub fn new(harness: Arc<dyn Harness>) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(Vec::new())),
            harness,
            ipc_client: None,
            plugin_manager: PluginManager::new(),
        }
    }

    pub fn with_ipc(mut self, ipc_client: IpcClient) -> Self {
        self.ipc_client = Some(ipc_client);
        self
    }

    pub async fn create_session(&self, project_path: Option<std::path::PathBuf>) -> Result<Session> {
        let session = Session::new(project_path);
        self.sessions.write().await.push(session.clone());
        Ok(session)
    }

    pub async fn get_sessions(&self) -> Vec<Session> {
        self.sessions.read().await.clone()
    }
}