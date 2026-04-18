use crate::checker::HealthChecker;
use crate::config::{DepMode, PythonIpcDepConfig};
use crate::error::{DependencyError, Result};
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

pub struct PythonIpcManager {
    config: PythonIpcDepConfig,
    checker: HealthChecker,
    child: Arc<Mutex<Option<Child>>>,
}

impl PythonIpcManager {
    pub fn new(config: PythonIpcDepConfig) -> Self {
        Self {
            config,
            checker: HealthChecker::new(),
            child: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn ensure_running(&self) -> Result<()> {
        info!("Checking Python IPC status");
        
        if std::path::Path::new(&self.config.socket_path).exists() {
            match self.checker.check_unix_socket(&self.config.socket_path, "python_ipc").await {
                Ok(_) => {
                    info!("Python IPC already running at {}", self.config.socket_path);
                    return Ok(());
                }
                Err(_) => {
                    debug!("Socket exists but not responding, removing stale socket");
                    std::fs::remove_file(&self.config.socket_path).ok();
                }
            }
        }

        if self.config.mode == DepMode::Manual {
            warn!("Python IPC not running, but mode is manual - skipping start");
            return Err(DependencyError::HealthCheckFailed {
                service: "python_ipc".to_string(),
                message: "Service not running and auto-start disabled".to_string(),
            });
        }

        debug!("Python IPC not running, attempting to start");
        self.spawn_process().await?;
        self.wait_for_healthy().await?;
        info!("Python IPC started successfully");
        Ok(())
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

        debug!("Spawning Python IPC: {} {:?}", cmd, args);

        let python_dir = Self::find_python_dir()?;
        debug!("Using python directory: {:?}", python_dir);
        
        let child = Command::new(cmd)
            .args(args)
            .current_dir(&python_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| DependencyError::ProcessSpawnFailed {
                service: "python_ipc".to_string(),
                message: e.to_string(),
            })?;

        let mut child_guard = self.child.lock().await;
        *child_guard = Some(child);

        Ok(())
    }

    fn find_python_dir() -> Result<std::path::PathBuf> {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                if exe_dir.join("sibyl_memory").exists() {
                    return Ok(exe_dir.to_path_buf());
                }
                if let Some(project_root) = exe_dir.parent() {
                    if project_root.join("python").join("sibyl_memory").exists() {
                        return Ok(project_root.join("python"));
                    }
                }
            }
        }

        let mut dir = std::env::current_dir()
            .map_err(|e| DependencyError::ConfigError {
                message: format!("Cannot get current directory: {}", e),
            })?;
        
        loop {
            if dir.join("python").join("sibyl_memory").exists() {
                return Ok(dir.join("python"));
            }
            if dir.join("sibyl_memory").exists() {
                return Ok(dir);
            }
            if !dir.pop() {
                break;
            }
        }

        std::env::current_dir()
            .map(|d| d.join("python"))
            .map_err(|e| DependencyError::ConfigError {
                message: format!("Cannot find python directory: {}", e),
            })
    }

    async fn wait_for_healthy(&self) -> Result<()> {
        self.checker
            .wait_for_socket(&self.config.socket_path, "python_ipc", self.config.startup_timeout)
            .await
    }

    pub async fn shutdown(&self) -> Result<()> {
        if self.config.mode == DepMode::Manual {
            debug!("Python IPC mode is manual, skipping shutdown");
            return Ok(());
        }

        let mut child_guard = self.child.lock().await;
        
        if let Some(mut child) = child_guard.take() {
            debug!("Stopping Python IPC process");
            
            child.kill().await.map_err(|e| DependencyError::ProcessSpawnFailed {
                service: "python_ipc".to_string(),
                message: format!("Failed to kill process: {}", e),
            })?;
            
            if std::path::Path::new(&self.config.socket_path).exists() {
                std::fs::remove_file(&self.config.socket_path).ok();
            }
            
            info!("Python IPC process stopped");
        }
        
        Ok(())
    }

    pub fn is_enabled(&self) -> bool {
        self.config.mode != DepMode::Manual
    }
}

impl Default for PythonIpcManager {
    fn default() -> Self {
        Self::new(PythonIpcDepConfig::default())
    }
}