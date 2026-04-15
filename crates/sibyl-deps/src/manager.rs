use crate::config::{DependenciesConfig, DepMode};
use crate::error::{DependencyError, Result};
use crate::falkordb::FalkorDBManager;
use crate::opencode::OpenCodeManager;
use crate::python_ipc::PythonIpcManager;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceStatus {
    Checking,
    Starting,
    Running,
    Degraded,
    Failed,
    Disabled,
}

#[derive(Debug, Clone)]
pub struct ServiceState {
    pub name: String,
    pub status: ServiceStatus,
    pub message: Option<String>,
}

impl ServiceState {
    pub fn new(name: &str, status: ServiceStatus) -> Self {
        Self {
            name: name.to_string(),
            status,
            message: None,
        }
    }

    pub fn with_message(name: &str, status: ServiceStatus, message: &str) -> Self {
        Self {
            name: name.to_string(),
            status,
            message: Some(message.to_string()),
        }
    }
}

pub struct DependencyManager {
    config: DependenciesConfig,
    opencode: Arc<OpenCodeManager>,
    falkordb: Arc<FalkorDBManager>,
    python_ipc: Arc<PythonIpcManager>,
    states: Arc<RwLock<Vec<ServiceState>>>,
}

impl DependencyManager {
    pub fn new(config: DependenciesConfig) -> Self {
        Self {
            config: config.clone(),
            opencode: Arc::new(OpenCodeManager::new(config.opencode.clone())),
            falkordb: Arc::new(FalkorDBManager::new(config.falkordb.clone())),
            python_ipc: Arc::new(PythonIpcManager::new(config.python_ipc.clone())),
            states: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(DependenciesConfig::default())
    }

    pub async fn ensure_all(&self) -> Result<()> {
        if !self.config.auto_start {
            info!("Auto-start disabled, skipping dependency checks");
            return Ok(());
        }

        self.init_states().await;

        let mut errors: Vec<DependencyError> = Vec::new();
        let mut any_critical_failed = false;

        self.update_state("opencode", ServiceStatus::Checking, None).await;
        match self.opencode.ensure_running().await {
            Ok(_) => self.update_state("opencode", ServiceStatus::Running, None).await,
            Err(e) => {
                any_critical_failed = true;
                self.update_state("opencode", ServiceStatus::Failed, Some(e.to_string())).await;
                errors.push(e);
            }
        }

        self.update_state("falkordb", ServiceStatus::Checking, None).await;
        match self.falkordb.ensure_running().await {
            Ok(_) => self.update_state("falkordb", ServiceStatus::Running, None).await,
            Err(e) => {
                warn!("FalkorDB failed to start, continuing in degraded mode: {}", e);
                self.update_state("falkordb", ServiceStatus::Degraded, Some("Memory features disabled".to_string())).await;
                errors.push(e);
            }
        }

        self.update_state("python_ipc", ServiceStatus::Checking, None).await;
        match self.python_ipc.ensure_running().await {
            Ok(_) => self.update_state("python_ipc", ServiceStatus::Running, None).await,
            Err(e) => {
                warn!("Python IPC failed to start, continuing in degraded mode: {}", e);
                self.update_state("python_ipc", ServiceStatus::Degraded, Some("Memory injection disabled".to_string())).await;
                errors.push(e);
            }
        }

        if any_critical_failed {
            error!("Critical dependency (OpenCode) failed to start");
            return Err(errors.into_iter().next().unwrap_or_else(|| {
                DependencyError::StartFailed {
                    service: "unknown".to_string(),
                    message: "Critical dependency failed".to_string(),
                }
            }));
        }

        if errors.is_empty() {
            info!("All dependencies running");
        } else {
            warn!("Running in degraded mode: {} service(s) unavailable", errors.len());
        }

        Ok(())
    }

    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down spawned dependencies");

        if let Err(e) = self.opencode.shutdown().await {
            warn!("Failed to shutdown OpenCode: {}", e);
        }

        if let Err(e) = self.python_ipc.shutdown().await {
            warn!("Failed to shutdown Python IPC: {}", e);
        }

        info!("Spawned processes stopped (FalkorDB container kept running)");
        Ok(())
    }

    pub async fn get_states(&self) -> Vec<ServiceState> {
        self.states.read().await.clone()
    }

    pub async fn get_status_summary(&self) -> String {
        let states = self.states.read().await;
        
        let running = states.iter().filter(|s| s.status == ServiceStatus::Running).count();
        let degraded = states.iter().filter(|s| s.status == ServiceStatus::Degraded).count();
        let failed = states.iter().filter(|s| s.status == ServiceStatus::Failed).count();

        if failed > 0 {
            format!("{} failed, {} running", failed, running)
        } else if degraded > 0 {
            format!("Degraded: {} unavailable, {} running", degraded, running)
        } else if running > 0 {
            format!("All {} services ready", running)
        } else {
            "No services checked".to_string()
        }
    }

    async fn init_states(&self) {
        let mut states = self.states.write().await;
        states.clear();

        let opencode_status = if self.config.opencode.mode == DepMode::Manual {
            ServiceStatus::Disabled
        } else {
            ServiceStatus::Checking
        };
        states.push(ServiceState::new("opencode", opencode_status));

        let falkordb_status = if self.config.falkordb.mode == DepMode::Manual {
            ServiceStatus::Disabled
        } else {
            ServiceStatus::Checking
        };
        states.push(ServiceState::new("falkordb", falkordb_status));

        let python_ipc_status = if self.config.python_ipc.mode == DepMode::Manual {
            ServiceStatus::Disabled
        } else {
            ServiceStatus::Checking
        };
        states.push(ServiceState::new("python_ipc", python_ipc_status));
    }

    async fn update_state(&self, name: &str, status: ServiceStatus, message: Option<String>) {
        let mut states = self.states.write().await;
        
        if let Some(state) = states.iter_mut().find(|s| s.name == name) {
            state.status = status;
            state.message = message;
        }
    }
}

impl Default for DependencyManager {
    fn default() -> Self {
        Self::with_defaults()
    }
}