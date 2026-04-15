use crate::checker::HealthChecker;
use crate::config::{DepMode, OpenCodeDepConfig};
use crate::error::{DependencyError, Result};
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

pub struct OpenCodeManager {
    config: OpenCodeDepConfig,
    checker: HealthChecker,
    child: Arc<Mutex<Option<Child>>>,
}

impl OpenCodeManager {
    pub fn new(config: OpenCodeDepConfig) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
            child: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn ensure_running(&self) -> Result<()> {
        info!("Checking OpenCode status");
        
        let health_url = format!("{}/health", self.config.url);
        
        match self.checker.check_http(&health_url, "opencode").await {
            Ok(_) => {
                info!("OpenCode already running at {}", self.config.url);
                Ok(())
            }
            Err(_) => {
                if self.config.mode == DepMode::Manual {
                    warn!("OpenCode not running, but mode is manual - skipping start");
                    return Err(DependencyError::HealthCheckFailed {
                        service: "opencode".to_string(),
                        message: "Service not running and auto-start disabled".to_string(),
                    });
                }
                
                debug!("OpenCode not running, attempting to start");
                self.spawn_process().await?;
                self.wait_for_healthy().await?;
                info!("OpenCode started successfully");
                Ok(())
            }
        }
    }

    async fn spawn_process(&self) -> Result<()> {
        let parts: Vec<&str> = self.config.spawn_command.split_whitespace().collect();
        if parts.is_empty() {
            return Err(DependencyError::ConfigError {
                message: "Empty spawn command".to_string(),
            });
        }

        let cmd = parts[0];
        let args = &parts[1..];

        debug!("Spawning OpenCode: {} {:?}", cmd, args);

        let child = Command::new(cmd)
            .args(args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| DependencyError::ProcessSpawnFailed {
                service: "opencode".to_string(),
                message: e.to_string(),
            })?;

        let mut child_guard = self.child.lock().await;
        *child_guard = Some(child);

        Ok(())
    }

    async fn wait_for_healthy(&self) -> Result<()> {
        let health_url = format!("{}/health", self.config.url);
        self.checker
            .wait_for_http(&health_url, "opencode", self.config.startup_timeout)
            .await
    }

    pub async fn shutdown(&self) -> Result<()> {
        let mut child_guard = self.child.lock().await;
        
        if let Some(mut child) = child_guard.take() {
            debug!("Stopping OpenCode process");
            
            child.kill().await.map_err(|e| DependencyError::ProcessSpawnFailed {
                service: "opencode".to_string(),
                message: format!("Failed to kill process: {}", e),
            })?;
            
            info!("OpenCode process stopped");
        }
        
        Ok(())
    }

    pub fn is_enabled(&self) -> bool {
        self.config.mode != DepMode::Manual
    }
}

impl Default for OpenCodeManager {
    fn default() -> Self {
        Self::new(OpenCodeDepConfig::default())
    }
}