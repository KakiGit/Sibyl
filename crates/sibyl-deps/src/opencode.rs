use crate::checker::HealthChecker;
use crate::config::{DepMode, OpenCodeDepConfig};
use crate::container::ContainerEnvironment;
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
    container_env: ContainerEnvironment,
}

impl OpenCodeManager {
    pub fn new(config: OpenCodeDepConfig) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
            child: Arc::new(Mutex::new(None)),
            container_env: crate::container::detect_container(),
        }
    }

    pub fn with_container_env(config: OpenCodeDepConfig, container_env: ContainerEnvironment) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
            child: Arc::new(Mutex::new(None)),
            container_env,
        }
    }

    pub async fn ensure_running(&self) -> Result<()> {
        info!("Checking OpenCode status (env: {})", self.container_env);
        
        let url = self.get_effective_url();
        let health_url = format!("{}/health", url);
        
        match self.checker.check_http(&health_url, "opencode").await {
            Ok(_) => {
                info!("OpenCode already running at {}", url);
                Ok(())
            }
            Err(_) => {
                match self.config.mode {
                    DepMode::Manual => {
                        warn!("OpenCode not running, but mode is manual - skipping start");
                        Err(DependencyError::HealthCheckFailed {
                            service: "opencode".to_string(),
                            message: "Service not running and auto-start disabled".to_string(),
                        })
                    },
                    DepMode::External | DepMode::Attach | DepMode::Container => {
                        warn!("OpenCode not available at {} (mode: {})", url, self.config.mode);
                        Err(DependencyError::HealthCheckFailed {
                            service: "opencode".to_string(),
                            message: format!(
                                "Not accessible at {} (mode: {}). \
                                Ensure OpenCode is running and accessible.",
                                url, self.config.mode
                            ),
                        })
                    },
                    DepMode::Spawn | DepMode::Auto => {
                        if self.container_env.is_containerized() {
                            warn!("OpenCode not available and running inside container - cannot spawn process");
                            warn!("Set mode to 'external' or 'attach' and ensure OpenCode is accessible at {}", url);
                            Err(DependencyError::HealthCheckFailed {
                                service: "opencode".to_string(),
                                message: format!(
                                    "Cannot spawn from {} environment. \
                                    Set mode to 'external' and ensure OpenCode is accessible at {}",
                                    self.container_env, url
                                ),
                            })
                        } else {
                            debug!("OpenCode not running, attempting to start");
                            self.spawn_process().await?;
                            self.wait_for_healthy().await?;
                            info!("OpenCode started successfully");
                            Ok(())
                        }
                    },
                }
            }
        }
    }

    fn get_effective_url(&self) -> String {
        match self.config.mode {
            DepMode::External | DepMode::Container => self.config.url.clone(),
            DepMode::Auto => {
                if self.container_env.is_containerized() {
                    let url = self.config.url.clone();
                    if url.contains("localhost") {
                        url.replace("localhost", "host.containers.internal")
                    } else {
                        url
                    }
                } else {
                    self.config.url.clone()
                }
            },
            _ => self.config.url.clone(),
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
        let url = self.get_effective_url();
        let health_url = format!("{}/health", url);
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